import * as assert from "node:assert";
import { test } from "node:test";
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
	AssertionError,
	QCRunner,
	readPromptFile,
	roundToNearest100th,
	printSummary,
	saveSummaryToJSON
} from "../src/main.js";

/**
 * @typedef {import('../src/main.js').Prompt} Prompt
 * @typedef {import('../src/main.js').PromptMap} PromptMap
 * @typedef {import('../src/main.js').QConfig} QConfig
 * @typedef {import('../src/main.js').QContext} QContext
 * @typedef {import('../src/main.js').QCDef} QCDef
 * @typedef {import('../src/main.js').QCResult} QCResult
 * @typedef {import('../src/main.js').TestFunc} TestFunc 
 * @typedef {import('../src/main.js').QCSummary} QCSummary
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsDir = join(__dirname, "prompts");
const outDir = join(__dirname, "out");

const TEST1_FILEPATH = join(promptsDir, "test1.prompt.json");
const TEST2_FILEPATH = join(promptsDir, "test2.prompt.json");
const TEST1_NUM_PROMPTS = 1;
const TEST2_NUM_PROMPTS = 3;

const EMPTY_FILEPATH = join(promptsDir, "empty.prompt.json");
const UNPARSABLE_FILEPATH = join(promptsDir, "unparse.prompt.json");
const NO_PROMPTGRPS_FILEPATH = join(promptsDir, "nopromptgrps.prompt.json");
const MISSING_PROMPTARRAY_FILEPATH = join(promptsDir, "misspromptarray.prompt.json");

/** @type {Prompt} **/
const DUMMY_PROMPT = {
	role: "assistant",
	content: "This is some content"
};

/**
 * @param {Prompt[]} prompts
 * @return {*}
 */
function dummyCompletion(prompts) {
	return DUMMY_PROMPT;
}

/**
 * @param {QContext} q
 * @param {*} response
 * @returns {void|Prompt}
 */
function dummyTest(q, response) {
	return response;
}

test("roundToNearest100th", (t) => {
	assert.strictEqual(roundToNearest100th(0.746), 0.75);
	assert.strictEqual(roundToNearest100th(0.75), 0.75);
});

test("QCRunner.qcDef with valid QConfig", (t) => {
	/** @type {QConfig} */
	const qConfig = {
		testName: "Test 1",
		promptFile: TEST1_FILEPATH,
		promptGrp: "test1"
	};	
	const qc = new QCRunner();
	let throws = false;
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, false);
});

test("QCRunner.test with valid args", (t) => {
	const qc = new QCRunner();
	let throws = false;
	try {
		const qcDef = qc.test("Test 1", TEST1_FILEPATH, "test1", dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, false);
});

test("QCRunner.complete with valid args", (t) => {
	const qc = new QCRunner();
	let throws = false;
	try {
		const qcDef = qc.complete("Complete 1", TEST1_FILEPATH, "test1", dummyCompletion);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, false);
});

test("QCRunner.qcDef with invalid QConfig:testName", (t) => {
	/** @type {QConfig} */
	const qConfig = {
		testName: "",
		promptFile: TEST1_FILEPATH,
		promptGrp: "test1"
	};
	const qc = new QCRunner();
	let throws = false;
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, true);

	throws = false;
	// @ts-ignore
	qConfig.testName = 12;
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, true);
});

test("QCRunner.qcDef with invalid QConfig:promptFile", (t) => {
	/** @type {QConfig} */
	const qConfig = {
		testName: "Test 1",
		promptFile: "file_doesnt_exist.json",
		promptGrp: "test1",
		scoreReq: 0.5
	};
	const qc = new QCRunner();
	let throws = false;
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, true);

	throws = false;
	// @ts-ignore
	qConfig.promptFile = 12;
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, true);
});

test("QCRunner.qcDef with invalid QConfig:promptGrp", (t) => {
	/** @type {QConfig} */
	const qConfig = {
		testName: "Test 1",
		promptFile: TEST1_FILEPATH,
		promptGrp: ""
	};
	const qc = new QCRunner();
	let throws = false;
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, true);

	throws = false;
	// @ts-ignore
	qConfig.promptGrp = 12;
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, true);
});

test("QCRunner.qcDef with invalid QConfig:scoreReq", (t) => {
	/** @type {QConfig} */
	const qConfig = {
		testName: "Test 1",
		promptFile: TEST1_FILEPATH,
		promptGrp: "test1",
		scoreReq: -1.0
	};
	const qc = new QCRunner();
	let throws = false;
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, true);

	throws = false;
	// @ts-ignore
	qConfig.scoreReq = "12";
	try {
		const qcDef = qc.qcDef(qConfig, dummyCompletion, dummyTest);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, true);
});

test("readPromptFile with valid file", async (t) => {
	let throws = false;
	try {
		/** @type {PromptMap} */
		const promptMap = await readPromptFile(TEST1_FILEPATH);
	} catch(e) {
		throws = true;
	}
	assert.strictEqual(throws, false);
});

test("readPromptFile with empty file", async (t) => {
	let throws = false;
	try {
		/** @type {PromptMap} */
		const promptMap = await readPromptFile(EMPTY_FILEPATH);		
	} catch(e) {		
		throws = true;
	}
	assert.strictEqual(throws, true);
});

test("readPromptFile with bad JSON", async (t) => {
	let throws = false;
	try {
		/** @type {PromptMap} */
		const promptMap = await readPromptFile(UNPARSABLE_FILEPATH);		
	} catch(e) {		
		throws = true;
	}
	assert.strictEqual(throws, true);
});

test("readPromptFile with no prompt grps", async (t) => {
	let throws = false;
	try {
		/** @type {PromptMap} */
		const promptMap = await readPromptFile(NO_PROMPTGRPS_FILEPATH);
	} catch(e) {		
		throws = true;
	}
	assert.strictEqual(throws, true);
});

test("readPromptFile with missing prompt array", async (t) => {
	let throws = false;
	try {
		/** @type {PromptMap} */
		const promptMap = await readPromptFile(MISSING_PROMPTARRAY_FILEPATH);
	} catch(e) {		
		throws = true;
	}
	assert.strictEqual(throws, true);
});

test("QCRunner.run from same file with no issues and all assertions passing", async (t) => {
	const qc = new QCRunner();
	qc.test(
		"Test 1",
		TEST1_FILEPATH,
		"test1",
		dummyCompletion,
		(q, response) => {
			assert.strictEqual(
				q.assertEqual(response, {
					role: "assistant",
					content: "This is some content"
				}),
				true
			);

			assert.strictEqual(
				q.assertDeepStrictEqual(response, {
					role: "assistant",
					content: "This is some content"
				}),
				true
			);

			const role = response.role;
			const content = response.content;

			assert.strictEqual(
				q.assertEqual(role, "assistant"),
				true
			);

			assert.strictEqual(
				q.assertStrictEqual(role, "assistant"),
				true
			);

			assert.strictEqual(
				q.assertIncludes(content, "some"),
				true
			);

			q.storeVar("keystr", "value");
			q.storeVar("keynum", 1.5);
		}
	);
	qc.test(
		"Test 2",
		TEST1_FILEPATH,
		"test2",
		dummyCompletion,
		(q, response) => {
			q.assertEqual(response.role, "assistant");
		},
		{
			scoreReq: 0.7
		}
	);
	qc.complete(
		"Complete 1",
		TEST1_FILEPATH,
		"test1",
		dummyCompletion
	);
	qc.test(
		"Test 3 - Custom Score",
		TEST1_FILEPATH,
		"test2",
		dummyCompletion,
		(q, response) => {
			q.score = 0.75;
		},
		{
			scoreReq: 0.67
		}
	);

	/** @type {QCSummary} */
	const qcSummary = await qc.run();
	assert.strictEqual(qcSummary.qcResults.length, 4);
	
	// NOTE: Because this comes from one file we can can be confident that
	// the results are in the same order as the tests went into it
	/** @type {QCResult} */
	const qcResult1 = qcSummary.qcResults[0];
	/** @type {Prompt[]} */
	const prompts1 = qcResult1.prompts;
	assert.strictEqual(qcResult1.numAssertions, 5);
	assert.strictEqual(qcResult1.numPassed, 5);
	assert.strictEqual(qcResult1.numFailed, 0);
	assert.strictEqual(qcResult1.score, 1);
	assert.strictEqual(qcResult1.passed, true);
	assert.strictEqual(qcResult1.storedVars.keystr, "value");
	assert.strictEqual(qcResult1.storedVars.keynum, 1.5);
	assert.strictEqual(prompts1.length, TEST1_NUM_PROMPTS + 1);
	assert.deepStrictEqual(prompts1[prompts1.length - 1], DUMMY_PROMPT);

	/** @type {QCResult} */
	const qcResult2 = qcSummary.qcResults[1];
	/** @type {Prompt[]} */
	const prompts2 = qcResult2.prompts;
	assert.strictEqual(qcResult2.numAssertions, 1);
	assert.strictEqual(qcResult2.numPassed, 1);
	assert.strictEqual(qcResult2.numFailed, 0);
	assert.strictEqual(qcResult2.score, 1);
	assert.strictEqual(qcResult2.scoreReq, 0.7);
	assert.strictEqual(qcResult2.passed, true);
	assert.strictEqual(prompts2.length, TEST2_NUM_PROMPTS + 1);
	assert.deepStrictEqual(prompts2[prompts2.length - 1], DUMMY_PROMPT);

	/** @type {QCResult} */
	const qcResult3 = qcSummary.qcResults[2];
	/** @type {Prompt[]} */
	const prompts3 = qcResult3.prompts;
	assert.strictEqual(qcResult3.numAssertions, 0);
	assert.strictEqual(qcResult3.numPassed, 0);
	assert.strictEqual(qcResult3.numFailed, 0);
	// As a complete with no assertions, we default to a score of 1 and pass
	assert.strictEqual(qcResult3.score, 1);
	assert.strictEqual(qcResult3.passed, true);
	assert.strictEqual(prompts3.length, TEST1_NUM_PROMPTS + 1);
	assert.deepStrictEqual(prompts3[prompts3.length - 1], DUMMY_PROMPT);

	const qcResult4 = qcSummary.qcResults[3];
	assert.strictEqual(qcResult4.score, 0.75);
	assert.strictEqual(qcResult4.scoreReq, 0.67);
	assert.strictEqual(qcResult4.passed, true);

	assert.doesNotThrow(() => { printSummary(qcSummary) });
	await saveSummaryToJSON(qcSummary, join(outDir, "testRun1.out.json"));
});

test("QCRunner.run from same file with issues and failed assertions", async (t) => {
	const qc = new QCRunner();
	qc.test(
		"Test 1",
		TEST1_FILEPATH,
		"test1",
		dummyCompletion,
		(q, response) => {
			assert.strictEqual(
				q.assertEqual(response.role, "assistant"),
				true
			);
			assert.strictEqual(
				q.assertEqual(response.role, "tool"),
				false
			);
			assert.strictEqual(
				q.assertIncludes(response.content, "absent"),
				false
			);
		}
	);
	qc.test(
		"Test 2",
		TEST1_FILEPATH,
		"test2",
		dummyCompletion,
		(q, response) => {
			// This will throw an error
			try {
				q.assertIncludes(null, "null");
				// Force an error
				assert.strictEqual(1, 0);
			} catch(e) {
				if (e instanceof AssertionError) {
					assert.strictEqual(1, 1);
					// Re-throw for proper functionality
					throw e;
				} else {
					// Force an error
					assert.strictEqual(1, 0);
				}
			}
		}
	);
	qc.test(
		"Test 3.1 - Custom Passed with no Mod",
		TEST1_FILEPATH,
		"test2",
		dummyCompletion,
		(q, response) => {}
	);
	qc.test(
		"Test 3.2 - Custom Passed with Mod",
		TEST1_FILEPATH,
		"test2",
		dummyCompletion,
		(q, response) => {
			q.passed = false;
		}
	);

	/** @type {QCSummary} */
	const qcSummary = await qc.run();
	assert.strictEqual(qcSummary.qcResults.length, 4);

	/** @type {QCResult} */
	const qcResult1 = qcSummary.qcResults[0];
	/** @type {Prompt[]} */
	const prompts1 = qcResult1.prompts;
	assert.strictEqual(qcResult1.numAssertions, 3);
	assert.strictEqual(qcResult1.numPassed, 1);
	assert.strictEqual(qcResult1.numFailed, 2);	
	assert.strictEqual(qcResult1.scoreReq, 1);
	assert.strictEqual(qcResult1.passed, false);
	assert.strictEqual(qcResult1.error, null);

	/** @type {QCResult} */
	const qcResult2 = qcSummary.qcResults[1];
	/** @type {Prompt[]} */
	const prompts2 = qcResult2.prompts;
	assert.notStrictEqual(qcResult2.error, null);

	const qcResult3 = qcSummary.qcResults[2];
	assert.strictEqual(qcResult3.score, 1);
	assert.strictEqual(qcResult3.passed, true);

	const qcResult4 = qcSummary.qcResults[3];
	assert.strictEqual(qcResult4.score, 1);
	assert.strictEqual(qcResult4.passed, false);

	assert.doesNotThrow(() => { printSummary(qcSummary) });
	await saveSummaryToJSON(qcSummary, join(outDir, "testRun2.out.json"));
});

test("QCRunner.run Multiple Files", async (t) => {
	const qc = new QCRunner();
	qc.test(
		"Test 1.1",
		TEST1_FILEPATH,
		"test1",
		dummyCompletion,
		(q, response) => {}
	);
	qc.test(
		"Test 2.1",
		TEST2_FILEPATH,
		"test1",
		dummyCompletion,
		(q, response) => {}
	);
	qc.test(
		"Test 1.2",
		TEST1_FILEPATH,
		"test2",
		dummyCompletion,
		(q, response) => {}
	);
	qc.test(
		"Test 2.2",
		TEST2_FILEPATH,
		"test2",
		dummyCompletion,
		(q, response) => {}
	);

	assert.notStrictEqual(qc.promptQCDefs[TEST1_FILEPATH], undefined);
	assert.strictEqual(qc.promptQCDefs[TEST1_FILEPATH].length, 2);
	assert.notStrictEqual(qc.promptQCDefs[TEST2_FILEPATH], undefined);
	assert.strictEqual(qc.promptQCDefs[TEST2_FILEPATH].length, 2);

	const qcSummary = await qc.run();
	assert.strictEqual(qcSummary.qcResults.length, 4);

	assert.doesNotThrow(() => { printSummary(qcSummary) });
	await saveSummaryToJSON(qcSummary, join(outDir, "testRun3.out.json"));
});
