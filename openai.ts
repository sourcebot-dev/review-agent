import dotenv from 'dotenv';    
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const prSummaryPrompt = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Diff

\`\`\`diff
$diff
\`\`\`

## Instructions

I would like you to succinctly summarize the diff within 100 words.
If applicable, your summary should include a note about alterations 
to the signatures of exported functions, global data structures and 
variables, and any changes that might affect the external interface or 
behavior of the code.
`

const botSummaryPrompt = `Your task is to provide a concise summary of the changes. This 
summary will be used as a prompt while reviewing each file and must be very clear for 
the AI bot to understand. 

Instructions:

- Focus on summarizing only the changes in the PR and stick to the facts.
- Do not provide any instructions to the bot on how to perform the review.
- Do not mention that files need a through review or caution about potential issues.
- Do not mention that these changes affect the logic or functionality of the code.
- The summary should not exceed 500 words.

## Diff

\`\`\`diff
$diff
\`\`\`
`

const reviewFileDiffPrompt = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Summary of changes

\`\`\`
$short_summary
\`\`\`

## IMPORTANT Instructions

Input: New hunks annotated with line numbers and old hunks (replaced code). Hunks represent incomplete code fragments.
Additional Context: PR title, description, summaries and comment chains.
Task: Review new hunks for substantive issues using provided context and respond with comments if necessary.
Output: Review comments in markdown with exact line number ranges in new hunks. Start and end line numbers must be within the same hunk. For single-line comments, start=end line number. Must use example response format below.
Use fenced code blocks using the relevant language identifier where applicable.
Don't annotate code snippets with line numbers. Format and indent code correctly.
Do not use \`suggestion\` code blocks.
For fixes, use \`diff\` code blocks, marking changes with \`+\` or \`-\`. The line number range for comments with fix snippets must exactly match the range to replace in the new hunk.

- Do NOT provide general feedback, summaries, explanations of changes, or praises 
  for making good additions.
- Do NOT provide any advice that is not actionable or directly related to the changes.
- Focus solely on offering specific, objective insights based on the 
  given context and refrain from making broad comments about potential impacts on 
  the system or question intentions behind the changes.
- Keep comments concise and to the point. Every comment must highlight a specific issue and 
  provide a clear and actionable solution to the developer.
- If there are no issues found on a line range, do NOT respond with any comments. This includes
  comments such as "No issues found" or "LGTM".


## Example

### Example changes

---new_hunk---
\`\`\`
  z = x / y
    return z

20: def add(x, y):
21:     z = x + y
22:     retrn z
23: 
24: def multiply(x, y):
25:     return x * y

def subtract(x, y):
  z = x - y
\`\`\`
  
---old_hunk---
\`\`\`
  z = x / y
    return z

def add(x, y):
    return x + y

def subtract(x, y):
    z = x - y
\`\`\`

---comment_chains---
\`\`\`
Please review this change.
\`\`\`

---end_change_section---

### Example response

[
    {
        "line_start": 22,
        "line_end": 22,
        "comment": "There's a syntax error in the add function.\n\`\`\`diff\n-    retrn z\n+    return z\n\`\`\`"
    }
]

## Changes made to \`$filename\` for your review

$file_diff
`

export function constructSummaryPrompt(title: string, description: string, diff: string): string {
  return prSummaryPrompt.replace("$title", title).replace("$description", description).replace("$diff", diff);
}

export function constructBotSummaryPrompt(title: string, description: string, diff: string): string {
  return botSummaryPrompt.replace("$title", title).replace("$description", description).replace("$diff", diff);
}

export function constructReviewFileDiffPrompt(title: string, description: string, shortSummary: string, filename: string, fileDiff: string, commentChains: string): string {
  return reviewFileDiffPrompt.replace("$title", title).replace("$description", description).replace("$short_summary", shortSummary).replace("$filename", filename).replace("$file_diff", fileDiff).replace("$comment_chains", commentChains);
}

export async function getOpenAIResponse(input: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: input }
      ]
    });

    return completion.choices[0].message.content || '';
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    throw error;
  }
}
