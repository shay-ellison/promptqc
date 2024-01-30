import { statSync } from "fs";
import { readFile, writeFile } from "node:fs/promises";
import * as assert from "node:assert";

/** @typedef {import('fs').Stats} Stats */

/** @typedef {"ParseConfig"|"ReadPromptFile"|"CallCompletion"|"TestFunc"|"ResponsePrompt"} Step */
/** @type {Object.<Step, Step>} */
export const Step = Object.freeze({
	ParseConfig: "ParseConfig",
	ReadPromptFile: "ReadPromptFile",
	CallCompletion: "CallCompletion",
	TestFunc: "TestFunc",
	ResponsePrompt: "ResponsePrompt"
});

/**
 * @typedef {string|object} Prompt
 * 
 * @typedef {Object.<string, Prompt[]>} PromptMap
 * 
 * @typedef {Object} QConfig
 * @property {string} testName
 * @property {string} promptFile
 * @property {string} promptGrp
 * @property {number} [scoreReq] - Defaults to 1.0
 * 
 * @typedef {Object} PartialQConfig
 * @property {number} [scoreReq]
 * 
 * @typedef {Object} SummaryTimeStats
 * @property {number} totalMs
 * @property {number} avgMs
 * 
 * @typedef {Object} ResultTimeStats
 * @property {number} totalMs
 * @property {number} completionMs
 * @property {number} testMs
 *
 * @typedef {Object} QCResult
 * @property {string} testName
 * @property {string} promptGrp
 * @property {Prompt[]} prompts
 * @property {number} numAssertions
 * @property {number} numPassed
 * @property {number} numFailed
 * @property {number} score
 * @property {number} scoreReq
 * @property {boolean} passed
 * @property {Assertion[]} failedAssertions
 * @property {StoredVars} storedVars
 * @property {ResultTimeStats} timeStats
 * @property {null|QError} error
 * 
 * @typedef {Object} QCSummary
 * @property {QCResult[]} qcResults
 * @property {SummaryTimeStats} timeStats
 *
 * @typedef {"StrictEqual"|"DeepStrictEqual"|"Includes"} AssertionType
 * 
 * @typedef {Object} Assertion
 * @property {*} lval
 * @property {*} rval
 * @property {AssertionType} type
 * @property {boolean} result
 *
 * @callback CompletionFunc
 * @param {Prompt[]} prompts
 * @returns {Promise<*>}
 *
 * @callback TestFuncSync
 * @param {QContext} q
 * @param {*} response
 * @returns {void|Prompt}
 *
 * @callback TestFuncAsync
 * @param {QContext} q
 * @param {*} response
 * @returns {Promise<void|Prompt>}
 *
 * @typedef {TestFuncSync|TestFuncAsync} TestFunc
 *
 * @typedef {Object} QCDef
 * @property {QConfig} qConfig
 * @property {CompletionFunc} completionFunc 
 * @property {TestFunc} testFunc
 *
 * @typedef {string|number|boolean} StoredVal
 * @typedef {Object.<string, StoredVal>} StoredVars
 */

/** @type {TestFunc} */
export const COMPLETE_ONLY_TEST = (q, response) => {};

/**
 * Round a number to the nearest 100th decimal place
 * @param {number} n
 * @returns {number}
 */
export function roundToNearest100th(n) {
	return Math.round(n * 100) / 100;
}

export class QError extends Error {
	/**
	 * Construct a QError
	 * @param {string} message
	 * @param {undefined|Error} cause
	 * @param {string} step
	 */
	constructor(message, cause, step) {
		super(message);
		/** @type {string} */
		this.name = "QError";
		/** @type {undefined|Error} */
		this.cause = cause;
		/** @type {string} */
		this.step = step;
	}
}

// This is an unexpected Error that happens during an Assertion
export class AssertionError extends Error {
	/**
	 * Construct an AssertionError
	 * @param {string} message
	 * @param {undefined|Error} cause
	 */
	constructor(message, cause=undefined) {
		super(message);
		/** @type {string} */
		this.name = "AssertionError";
		/** @type {undefined|Error} */
		this.cause = cause;
		this.causeJson = undefined;
		if (cause && cause instanceof Error) {
			this.causeJson = JSON.stringify(cause, ["name", "message"]);
		}
	}
}

// TODO: Allow custom string with your assert if things fail
export class QContext {
	/**
	 * Create a QContext object
	 * @param {QConfig} qConfig
	 */
	constructor(qConfig) {
		/** @type {QConfig} */
		this.qConfig = qConfig;
		this.numAssertions = 0;
		this.numPassed = 0;
		this.numFailed = 0;
		// We start off passing basically, including letting the score be 1.0
		this.score = 1.0;
		
		// To let the user control this
		/** @type {undefined|boolean} */
		this.passed = undefined;
		
		/** @type {Assertion[]} */
		this.assertions = [];
		/** @type {Assertion[]} */
		this.failedAssertions = [];

		/** @type {StoredVars} */
		this.storedVars = {};
	}

	/**
	 * Store a simple var that will be kept with the QCResult
	 * and will be saved or printed using a QCSummary.
	 * @param {string} name
	 * @param {StoredVal} value
	 */
	storeVar(name, value) {
		const valueType = typeof value;
		if (valueType !== "number" && valueType !== "string" && valueType !== "boolean") {
			// console.log(`x ${this.qConfig.testName}: stored var must be a number, string, or boolean`);
			return;
		}
		this.storedVars[name] = value;
	}

	/**
	 * Assert Equals with automatic StrictEquals / DeepStrictEquals detection
	 * @param {*} lval
	 * @param {*} rval
	 * @returns {boolean}
	 */
	assertEqual(lval, rval) {
		if (typeof lval === "object" && typeof rval === "object") {
			return this.assertDeepStrictEqual(lval, rval);
		} else {
			return this.assertStrictEqual(lval, rval);
		}
	}

	/**
	 * @param {*} lval
	 * @param {*} rval
	 * @returns {boolean}
	 */
	assertStrictEqual(lval, rval) {
		let result = false;
		try {
			result = lval === rval;
		} catch(e) {
			if (e instanceof Error) {
				/** @type {Error} */
				const error = e;
				throw new AssertionError(e.toString(), e);
			} else {
				throw new AssertionError("", undefined);
			}
		}

		// ObjectEquals and Equals, but just use Equals for an easy life
		this.logAssertion(lval, rval, "StrictEqual", result);
		return result;
	}

	/**
	 * @param {object} lval
	 * @param {object} rval
	 * @returns {boolean}
	 */
	assertDeepStrictEqual(lval, rval) {
		let result = false;
		try {
			assert.deepStrictEqual(lval, rval);
			result = true;
		} catch(e) {
			if (e instanceof assert.AssertionError) {
				result = false;
			} else if (e instanceof Error) {
				/** @type {Error} */
				const error = e;
				throw new AssertionError(e.toString(), e);
			} else {
				throw new AssertionError("", undefined);
			}
		}

		// ObjectEquals and Equals, but just use Equals for an easy life
		this.logAssertion(lval, rval, "DeepStrictEqual", result);
		return result;
	}

	/**
	 * @param {*} lval
	 * @param {*} rval
	 * @returns {boolean}
	 */
	assertIncludes(lval, rval) {
		let result = false;

		try {
			if (lval.includes !== undefined) {
				result = lval.includes(rval);
			} else {
				throw new AssertionError("'includes' method not defined for 'lval'");
			}
		} catch(e) {
			if (e instanceof Error) {
				throw new AssertionError(e.toString(), e);
			} else {
				if (e === null || e === undefined) {
					throw new AssertionError("Unknown error occurred", undefined);
				} else {
					throw new AssertionError(e.toString(), undefined);
				}
			}
		}

		this.logAssertion(lval, rval, "Includes", result);
		return result;
	}

	/**
	 * @param {*} lval
	 * @param {*} rval
	 * @param {AssertionType} assertType
	 * @param {boolean} result
	 */
	logAssertion(lval, rval, assertType, result) {
		const idx = this.numAssertions;
		/** @type{Assertion} */
		const assertion = {
			lval: lval,
			rval: rval,
			type: assertType,
			result: result
		};
		this.assertions.push(assertion);
		this.numAssertions += 1;
		if (result) {
			this.numPassed += 1;
		} else {
			this.numFailed += 1;
			this.failedAssertions.push(assertion);
		}
		this.calcScore();
	}

	/**
	 * Calculate and save score based on current assertions. Doesn't round.
	 * @returns {number}
	 */
	calcScore() {
		if (this.numAssertions === 0) {
			return 1.0;
		}
		this.score = this.numPassed / this.numAssertions;
		return this.score;
	}

	/**
	 * Round the current score to the nearest 100th decimal place.
	 * @returns {number}
	 */
	roundScore() {
		return roundToNearest100th(this.score);
	}
}

/**
 * Check that we have a valid PromptMap.
 * Returns an error message if there's a problem.
 * @param {Object.<string, *>} possPromptMap
 * @returns {string|null}
 */
export function checkValidPromptMap(possPromptMap) {
	const promptGrps = Object.keys(possPromptMap);
	if (promptGrps.length === 0) {
		return "No prompt groups defined";
	}
	for (let promptGrp of promptGrps) {
		/** @type {*} */
		const prompts = possPromptMap[promptGrp];
		if (!Array.isArray(prompts)) {
			return `'${promptGrp}' missing array of prompts`;
		}
	}
	return null;
}

/**
 * Read in a prompt file to a PromptMap. Assumes filepath exists.
 * @param {string} filepath
 * @returns {Promise<PromptMap>}
 * @throws {Error}
 */
export async function readPromptFile(filepath) {
	const json = await readFile(filepath, {
		encoding: "ascii"
	});

	if (!json) {
		throw new Error(`${filepath}: File is empty`);
	}

	// /** @type {Object.<string, *>} */
	const data = JSON.parse(json);

	if (!data) {
		throw new Error(`${filepath}: Error parsing json`);
	}

	// Let's check that it's actually a PromptMap
	const errorMsg = checkValidPromptMap(data);
	if (errorMsg) {
		throw new Error(`${filepath}: ${errorMsg}`);
	}
	const promptMap = /** @type{PromptMap} */data;
	return promptMap;
}

/**
 * Load a group of prompts from a given file.
 * Returns an empty array if the prompt group does not exist.
 * @param {string} filepath
 * @param {string} promptGrp
 * @returns {Promise<Prompt[]>}
 * @throws {Error}
 */
export async function loadPromptGrp(filepath, promptGrp) {
	if (!filepath || !promptGrp) {
		return [];
	}
	const promptMap = await readPromptFile(filepath);
	return promptMap[promptGrp] ?? [];
}

/**
 * Process QCDef
 * @param {QCDef} qcDef
 * @param {Prompt[]} prompts
 * @returns {Promise<QCResult>}
 */
export async function processQCDef(qcDef, prompts) {
	const startTotal = performance.now();
	/** @type {ResultTimeStats} */
	const timeStats = {
		totalMs: 0,
		completionMs: 0,
		testMs: 0
	};

	const scoreReq = qcDef.qConfig.scoreReq ?? 1.0;
	/** @type {QCResult} */
	const qcResult = {
		testName: qcDef.qConfig.testName,
		promptGrp: qcDef.qConfig.promptGrp,
		prompts: [],
		numAssertions: 0,
		numPassed: 0,
		numFailed: 0,
		score: 0.0,
		scoreReq,
		passed: false,
		failedAssertions: [],
		storedVars: {},
		timeStats,
		error: null
	};
	/** @type {QContext} */
	const qContext = new QContext(qcDef.qConfig);

	const startCompletion = performance.now();
	/** @type {*} */
	let response;
	try {
		response = await qcDef.completionFunc(prompts);
	} catch(e) {
		if (e instanceof Error) {
			qcResult.error = new QError("", e, Step.CallCompletion);
		} else {
			qcResult.error = new QError("Unknown error occurred in 'completionFunc'", undefined, Step.CallCompletion);
		}
		return qcResult;
	}
	const endCompletion = performance.now();

	if (!response) {
		qcResult.error = new QError("'completionFunc' returned an empty value", undefined, Step.CallCompletion);
		return qcResult;
	}
	
	const startTest = performance.now();
	let responsePrompt = undefined;
	try {
		responsePrompt = await qcDef.testFunc(qContext, response) ?? response;
	} catch(e) {
		if (e instanceof Error) {
			qcResult.error = new QError("", e, Step.TestFunc);
		} else {
			qcResult.error = new QError("Unknown error occurred in 'testFunc'", undefined, Step.TestFunc);
		}
		return qcResult;
	}
	const endTest = performance.now();

	// TODO: We can check for existence of responsePrompt
	/*if (!responsePrompt) {

	}*/

	qcResult.prompts = [...prompts, responsePrompt];
	qcResult.numAssertions = qContext.numAssertions;
	qcResult.numPassed = qContext.numPassed;
	qcResult.numFailed = qContext.numFailed;

	if (typeof qContext.score !== "number" || Number.isNaN(qContext.score)) {
		// TODO: Come up with another way to record this
		// console.log(`x ${qcResult.testName}: 'score' must be a number`);
		qcResult.score = 0;
	}
	qcResult.score = qContext.roundScore();

	if (qContext.passed !== undefined) {
		if (typeof qContext.passed !== "boolean") {
			// TODO: Come up with another way to record this
			// console.log(`x ${qcResult.testName}: 'passed' must be a boolean`);
			qcResult.passed = qcResult.score >= scoreReq;
		} else {
			// passed was already specified
			qcResult.passed = qContext.passed;
		}
	} else {
		// Check the score vs. the required score
		qcResult.passed = qcResult.score >= scoreReq;
	}

	qcResult.failedAssertions = qContext.failedAssertions;
	qcResult.storedVars = qContext.storedVars;

	const endTotal = performance.now();
	timeStats.totalMs = roundToNearest100th(endTotal - startTotal);
	timeStats.completionMs = roundToNearest100th(endCompletion - startCompletion);
	timeStats.testMs = roundToNearest100th(endTest - startTest);
	return qcResult;
}

/**
 * Check if there are any issues with the given QConfig
 * @param {QConfig} qConfig
 * @returns {QError|null}
 */
export function checkQConfig(qConfig) {
	/**
	 * @param {string} msg	 
	 * @returns {QError}
	 */
	function ce(msg) {
		return new QError(msg, undefined, Step.ParseConfig);
	}

	if (typeof qConfig.testName !== "string") {
		return ce("'testName' must be a string");
	} else if (!qConfig.testName) {
		return ce("'testName' cannot be empty");
	}

	if (typeof qConfig.promptFile !== "string") {
		return ce("'promptFile' must be a string");
	} else if (!qConfig.promptFile) {
		return ce("'promptFile' cannot be empty");
	} else { // check that the file exists
		/** @type {Stats} */
		let stats;
		try {
			stats = statSync(qConfig.promptFile);
		} catch(statError) {
			// @ts-ignore
			if (statError instanceof Error && statError.code === "ENOENT") {
				return ce(`'promptFile' '${qConfig.promptFile}' does not exist.`);
			} else {
				return ce(`'promptFile' '${qConfig.promptFile}' is inaccessible.`);
			}
		}

		if (stats.isDirectory()) {
			return ce(`'promptFile' '${qConfig.promptFile}' is a directory`)
		}
	}

	if (typeof qConfig.promptGrp !== "string") {
		return ce("'promptGrp' must be a string");
	} else if (!qConfig.promptGrp) {
		return ce("'promptGrp' cannot be empty");
	}
	
	if (qConfig.scoreReq) {
		if (typeof qConfig.scoreReq !== "number") {
			return ce("'scoreReq' must be a number");
		} else if (qConfig.scoreReq < 0) {
			return ce("'scoreReq' should be >= 0");
		}
	}
	return null;
}

export class QCRunner {
	constructor() {
		/** @type {Object.<string, QCDef[]>} */
		this.promptQCDefs = {};
	}

	/**
	 * Creates the most granular QCDef.
	 * Throws a QError if there is a problem with the qConfig.
	 * @param {QConfig} qConfig
	 * @param {CompletionFunc} completionFunc 
	 * @param {TestFunc} testFunc
	 * @return {QCDef}
	 */
	qcDef(
		qConfig,
		completionFunc,
		testFunc
	) {
		const configError = checkQConfig(qConfig);
		if (configError) {
			// TODO: Provide better feedback
			throw configError;
		}

		const qcDef = {
			qConfig,
			completionFunc,
			testFunc
		};

		/** @type {undefined|QCDef[]} */
		const qcDefs = this.promptQCDefs[qcDef.qConfig.promptFile];
		if (!qcDefs) {
			this.promptQCDefs[qcDef.qConfig.promptFile] = [qcDef];
		} else {
			qcDefs.push(qcDef);
		}
		
		return qcDef;
	}

	/**
	 * Chat Complete and Test the prompts for a given promptGrp in a promptFile
	 * @param {string} testName
	 * @param {string} promptFile
	 * @param {string} promptGrp
	 * @param {CompletionFunc} completionFunc
	 * @param {TestFunc} testFunc
	 * @param {PartialQConfig} partialQConfig
	 * @returns {QCDef}
	 */
	test(
		testName,
		promptFile,
		promptGrp,
		completionFunc,
		testFunc,
		{ scoreReq=undefined }={}
	) {
		return this.qcDef(
			{
				testName,
				promptFile,
				promptGrp,
				scoreReq
			},
			completionFunc,
			testFunc
		);
	}

	/**
	 * Chat Complete the prompts for a given promptGrp, but don't worry about testing.
	 * @param {string} testName
	 * @param {string} promptFile
	 * @param {string} promptGrp
	 * @param {CompletionFunc} completionFunc
	 * @returns {QCDef}
	 */
	complete(
		testName,
		promptFile,
		promptGrp,
		completionFunc
	) {
		return this.qcDef(
			{
				testName,
				promptFile,
				promptGrp
			},
			completionFunc,
			COMPLETE_ONLY_TEST
		);
	}

	/**
	 * @returns {Promise<QCSummary>}
	 */
	async run() {
		const startTotal = performance.now();

		/** @type {QCResult[]} */
		const qcResults = [];
		/** @type {SummaryTimeStats} */
		const timeStats = {
			totalMs: 0,
			avgMs: 0
		};
		/** @type {QCSummary} */
		const qcSummary = {
			qcResults,
			timeStats
		};

		/** @type {Promise<QCResult>[]} */
		const qcPromises = [];

		const promptFilepaths = Object.keys(this.promptQCDefs);
		for (let promptFilepath of promptFilepaths) {
			let promptGrps;
			try {
				promptGrps = await readPromptFile(promptFilepath);
			} catch(e) {
				if (e instanceof Error) {
					console.log(e.toString());
				} else {
					console.log(`${promptFilepath}: Problem reading file`);
				}
				continue;
			}

			/** @type {QCDef[]} */
			const qcDefs = this.promptQCDefs[promptFilepath] ?? [];
			for (let qcDef of qcDefs) {
				const promptGrp = qcDef.qConfig.promptGrp;
				/** type {undefined|Prompt[]} */
				const prompts = promptGrps[promptGrp];
				if (!prompts) {
					console.log(
						`${qcDef.qConfig.promptFile}: promptGrp '${promptGrp}' does not exist`
					);
					continue;
				}
				qcPromises.push(processQCDef(qcDef, prompts));
			}
		}

		const results = await Promise.allSettled(qcPromises);

		for (let result of results) {
			if (result.status === "fulfilled") {
				qcResults.push(result.value);
			}
			// TODO: Record the rejected ones as well
		}

		const endTotal = performance.now();
		const totalMs = endTotal - startTotal;
		timeStats.totalMs = roundToNearest100th(totalMs);
		if (results.length > 0) {
			timeStats.avgMs = roundToNearest100th(totalMs / results.length);
		}

		return qcSummary;
	}
}

/**
 * @param {Assertion} assertion
 * @returns {string}
 */
export function makeAssertionHumanReadable(assertion) {
	// NOTE: Right now all the assertions are binary operations
	// might have to change this in the future
	if (assertion.type === "StrictEqual") {
		return `'${assertion.lval}' expected to strict equal '${assertion.rval}'`;
	} else if (assertion.type === "DeepStrictEqual") {
		const lstring = JSON.stringify(assertion.lval);
		const rstring = JSON.stringify(assertion.rval);
		return `'${lstring}' expected to deep strict equal '${rstring}'`;
	} else if (assertion.type === "Includes") {
		return `'${assertion.lval}' expected to include '${assertion.rval}'`;
	}
	return "assertion failed";
}

/**
 * @param {QError} qError
 * @returns {string}
 */
export function makeQErrorHumanReadable(qError) {
	if (!qError.cause) {
		return `${qError.step}: Error: ${qError.message}`;
	} else {
		return `${qError.step}: ${qError.cause.toString()}`;
	}
}

/** @typedef {string} ColorCode */
/** @type {Object.<string, string>} */
export const FgColorCode = Object.freeze({
	Clear: "\x1b[0m",
	Green: "\x1b[32m",
	Red: "\x1b[31m",
	White: "\x1b[37m",
	Gray: "\x1b[90m",
	BrightWhite: "\x1b[97m"
});

/**
 * Save the Run Output to a JSON file. This is the most straightforward way to save output.
 * @param {QCSummary} qcSummary
 * @param {string} saveFile
 */
export async function saveSummaryToJSON(qcSummary, saveFile) {
	const outJSON = JSON.stringify(qcSummary, null, 2);
	await writeFile(saveFile, outJSON, {
		encoding: "ascii" // might want flush: true
	});
}

/**
 * Print a QCSummary to stdout
 * @param {QCSummary} qcSummary
 */
export function printSummary(qcSummary) {
	for (let qcResult of qcSummary.qcResults) {
		const scoreString = qcResult.score.toFixed(2);
		const timeStats = qcResult.timeStats;

		if (qcResult.passed) {
			console.log(
				`${FgColorCode.Green}+ ${qcResult.testName} | ${qcResult.promptGrp} | Score: ${scoreString} ${FgColorCode.Gray}(${timeStats.totalMs}ms)`
			);
		} else {
			if (qcResult.error) {
				console.log(`${FgColorCode.Red}- ${qcResult.testName} | ${qcResult.promptGrp} ${FgColorCode.Gray}(${timeStats.totalMs}ms)`);
				console.log(
					`${FgColorCode.Red}> ${FgColorCode.Clear}${makeQErrorHumanReadable(qcResult.error)}`
				);
			} else {
				console.log(`${FgColorCode.Red}- ${qcResult.testName} | ${qcResult.promptGrp} | Score: ${scoreString} ${FgColorCode.Gray}(${timeStats.totalMs}ms)`);
				for (let assertion of qcResult.failedAssertions) {
					console.log(
						`${FgColorCode.Red}> ${FgColorCode.Clear}${makeAssertionHumanReadable(assertion)}`
					);
				}
			}
		}
	}

	console.log(`${FgColorCode.Clear}\n* ${qcSummary.qcResults.length} qcs`);
	console.log(`* ${qcSummary.timeStats.totalMs}ms`);
}
