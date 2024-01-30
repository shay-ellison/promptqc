# promptqc: the modular prompt quality control and testing library

`promptqc` provides a basic, but powerful, toolset to help you evaluate and test prompts.

The library has been designed to make as few assumptions about your application
as possible while providing a framework to run tests written in actual Typescript or Javascript files.
Prompt files provide the prompts you wish to run tests on, but tests are kept in code.

This means you can take maximum advantage of your existing codebase to integrate the prompt testing.
You can also easily write functions to be used across your prompt tests. As a bonus, since your
prompts aren't tied directly to the tests, you can easily send the same prompts through to any
LLM you want.

## Basic Usage

Create a prompts file with all your prompts separated into groups.

We might make a file like this called `promptsFile.json`:

```json
{
  "prompts1": [
    { "role": "system", "content": "Respond to the user. Limit your response to 2 sentences."},
    { "role": "user", "content": "This is prompts1. Hello" },
    { "role": "assistant", "content": "Hello there how can I help?" },
    { "role": "user", "content": "Please write prompts2 and prompts3 for me."}
  ],
  "prompts2": [
    { "role": "user", "content": "Hi"}
  ]
}
```

Then in some sort of Javascript or Typescript file, say `promptTests.ts`:

```typescript
import { QCRunner, printSummary } from 'promptqc';
import type { Prompt, QCSummary } from 'promptqc';

/*
 * promptqc just needs a completion function to
 * receive a list of prompts provided in the prompts file
 * and return anything
 * May be async or not
 */
async function callLLM(prompts: Prompt[]): Promise<any> {
    return {
        role: 'assistant',
        content: 'Assistant message.'
    }
}

const qc = new QCRunner();

qc.test(
    'Prompt Test 1.1', // Whatever you want to name your test
    'path/to/promptsFile.json', // The file where your prompts are located
    'prompts1', // This is the promptGrp you want to test from your prompts file
    callLLM,
    (q, response) => {
        // You're provided with a QContext object (q)
        // and the response from the provided completion function
        q.assertEqual(response.role, 'assistant');
        q.assertIncludes(response.content, 'message');
    }
);

// Running the QCRunner produces a QCSummary
// that we will go over later
const qcSummary: QCSummary = await qc.run();

// At a basic level we can print out the results of running our tests
printSummary(qcSummary);
```

The output of this particular test look like this:

```bash
+ Prompt Test 1.1 | prompts1 | Score: 1.00 (0.16ms)

* 1 qcs
* 1.04ms
```

Or we can choose to save the output to JSON:

```typescript
import { saveSummaryToJSON } from 'promptqc';

saveSummaryToJSON(qcSummary, 'path/to/save.json');
```

And that looks like this:

```json
{
  "qcResults": [
    {
      "testName": "Prompt Test 1.1",
      "promptGrp": "prompts1",
      "prompts": [
        {
          "role": "system",
          "content": "Respond to the user. Limit your response to 2 sentences."
        },
        {
          "role": "user",
          "content": "This is prompts1. Hello"
        },
        {
          "role": "assistant",
          "content": "Hello there how can I help?"
        },
        {
          "role": "user",
          "content": "Please write prompts2 and prompts3 for me."
        },
        {
          "role": "assistant",
          "content": "Assistant message."
        }
      ],
      "numAssertions": 2,
      "numPassed": 2,
      "numFailed": 0,
      "score": 1,
      "scoreReq": 1,
      "passed": true,
      "failedAssertions": [],
      "storedVars": {},
      "timeStats": {
        "totalMs": 0.16,
        "completionMs": 0.01,
        "testMs": 0.09
      },
      "error": null
    }
  ],
  "timeStats": {
    "totalMs": 1.05,
    "avgMs": 1.05
  }
}
```

`promptqc` outputs the prompts in the same format that they are read in so that they can be easily
copied into new prompt groups or prompt files.

## More Usage

Since we pull from the same prompts file, but the tests are separate, we can call two different LLMs side-by-side against the same prompts.

```typescript
function callLLM1(prompts: Prompt[]): any {
    // Call LLM 1
}

function callLLM2(prompts: Prompt[]): any {
    // Call LLM 2
}

const qc = new QCRunner();

qc.test(
    'Prompt Test 1.1', // Whatever you want to name your test
    'path/to/promptsFile.json', // The file where your prompts are located
    'prompts1', // This is the promptGrp you want to test from your prompts file
    callLLM1,
    (q, response) => {
        // You're provided with a QContext object (q)
        // and the response from the provided completion function
        q.assertEqual(response.role, 'assistant');
        q.assertIncludes(response.content, 'message');
    }
);

qc.test(
    'Prompt Test 1.2', // Whatever you want to name your test
    'path/to/promptsFile.json', // The file where your prompts are located
    'prompts1', // This is the promptGrp you want to test from your prompts file
    callLLM2,
    (q, response) => {
        // You're provided with a QContext object (q)
        // and the response from the provided completion function
        q.assertEqual(response.role, 'assistant');
        q.assertIncludes(response.content, 'message');
    }
);
```

The `QCRunner#test` method was created to be a fast way to create a test for a prompt group, but it's not your only option.
If you only wish to get the completion for a particular prompt group (to save with `saveSummaryToJSON` for instance),
then you can call `QCRunner#complete` instead.

```typescript
const qc = new QCRunner();

qc.complete(
    'Complete 1.1', // Completion/"test" name
    'path/to/promptsFile.json', // Prompts file
    'prompts1', // Prompt Group
    callLLM // Just the completion function
);
```

## Output

There are two output options built into `promptqc` right now:

- `printSummary`: Prints the results of the tests to stdout
- `saveSummaryToJSON`: Saves the full `QCSummary` object to a JSON file

Examples of both:

```typescript
import { printSummary, saveSummaryToJSON } from 'promptqc';
import type { QCSummary } from 'promptqc';

const qcSummary: QCSummary = await qc.run();

printSummary(qcSummary);
saveSummaryToJSON(qcSummary, 'path/to/save.json');
```

More output options will be created in the future, but in the meantime it's simple to create your own
if you have any specific output requirements.

## Install

`npm install promptqc`
