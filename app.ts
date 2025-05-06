import dotenv from 'dotenv';
import { App, Octokit } from "octokit";
import { createNodeMiddleware } from "@octokit/webhooks";
import fs from "fs";
import http from "http";
import { WebhookEventDefinition } from "@octokit/webhooks/types";
import parse from "parse-diff";
import { constructBotSummaryPrompt, constructReviewFileDiffPrompt, getOpenAIResponse } from "./openai.js";
import { z } from "zod";

const reviewSchema = z.object({
    line_start: z.number(),
    line_end: z.number(),
    comment: z.string(),
});

dotenv.config();
const appId = process.env.APP_ID as string;
const webhookSecret = process.env.WEBHOOK_SECRET as string;
const privateKeyPath = process.env.PRIVATE_KEY_PATH as string;

const privateKey = fs.readFileSync(privateKeyPath, "utf8");

const app = new App({
    appId: appId,
    privateKey: privateKey,
    webhooks: {
        secret: webhookSecret
    },
});

const constructChunkPatch = (chunk: parse.Chunk): string => {
    let result = '---new_hunk---\n```\n';

    // Add new changes with line numbers
    for (const change of chunk.changes) {
        if (change.type === 'normal' || change.type === 'add') {
            const lineNum = change.type === 'normal' ? change.ln2 : change.ln;
            result += `${lineNum}: ${change.content.substring(1)}\n`;
        }
    }

    result += '```\n\n';
    result += '---old_hunk---\n```\n';

    // Add old changes with line numbers
    for (const change of chunk.changes) {
        if (change.type === 'normal' || change.type === 'del') {
            const lineNum = change.type === 'normal' ? change.ln1 : change.ln;
            result += `${lineNum}: ${change.content.substring(1)}\n`;
        }
    }

    result += '```\n';

    return result;
}

async function handlePullRequestOpened({
    octokit,
    payload,
}: {
    octokit: Octokit;
    payload: WebhookEventDefinition<"pull-request-opened"> | WebhookEventDefinition<"pull-request-synchronize">;
}) {
    console.log(`Received a pull request event for #${payload.pull_request.number}`);

    const diff = await octokit.request(payload.pull_request.patch_url);
    const parsedDiff: parse.File[] = parse(diff.data);

    const botSummaryPrompt = constructBotSummaryPrompt(payload.pull_request.title, payload.pull_request.body ?? "", diff.data);
    const botSummary = await getOpenAIResponse(botSummaryPrompt);

    console.log(`################### Bot summary prompt:\n ${botSummaryPrompt}`);
    console.log(`################### Bot summary:\n ${botSummary}`);
    
    const installationId = payload.installation!.id;
    const installation = await app.getInstallationOctokit(installationId);

    for (const fileDiff of parsedDiff) {
        for (const chunk of fileDiff.chunks) {
            const patch = constructChunkPatch(chunk);
            const reviewFileDiffPrompt = constructReviewFileDiffPrompt(payload.pull_request.title, payload.pull_request.body ?? "", botSummary, fileDiff.to!, patch, "");
            const response = await getOpenAIResponse(reviewFileDiffPrompt);
            const responseArray = JSON.parse(response);

            for (const review of responseArray) {
                const reviewFileDiff = reviewSchema.parse(review);

                console.log(`################### patch:\n ${patch}`);
                console.log(`################### Review file diff prompt:\n ${reviewFileDiffPrompt}`);
                console.log(`################### Review file diff:\n ${JSON.stringify(reviewFileDiff, null, 2)}`);

                await installation.rest.pulls.createReviewComment({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    pull_number: payload.pull_request.number,
                    body: review.comment,
                    path: fileDiff.to!,
                    commit_id: payload.pull_request.head.sha,
                    side: "RIGHT",
                    ...(review.line_start === review.line_end
                        ? { line: review.line_start }
                        : {
                            start_line: review.line_start,
                            line: review.line_end,
                            start_side: "RIGHT",
                        }),
                });
            }
        }
    }
}

app.webhooks.on("pull_request.opened", handlePullRequestOpened);
app.webhooks.on("pull_request.synchronize", handlePullRequestOpened);

app.webhooks.onError((error) => {
    console.error(error);
});


const port = 3000;
const host = 'localhost';
const path = "/api/webhook";
const localWebhookUrl = `http://${host}:${port}${path}`;

const middleware = createNodeMiddleware(app.webhooks, { path });

http.createServer(middleware).listen(port, () => {
    console.log(`Server is listening for events at: ${localWebhookUrl}`);
    console.log('Press Ctrl + C to quit.')
});
