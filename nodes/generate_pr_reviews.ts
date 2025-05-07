import { sourcebot_pr_payload, sourcebot_diff_review, sourcebot_file_diff_review } from "../types.js";
import { generate_diff_review_prompt } from "./generate_diff_review_prompt.js";
import { invoke_diff_review_llm } from "./invoke_diff_review_llm.js";

export const generate_pr_reviews = async (pr_payload: sourcebot_pr_payload, rules: string[]): Promise<sourcebot_file_diff_review[]> => {
    console.log("Executing generate_pr_reviews");
    
    const file_diff_reviews: sourcebot_file_diff_review[] = [];
    for (const file_diff of pr_payload.file_diffs) {
        const reviews: sourcebot_diff_review[] = [];
        for (const diff of file_diff.diffs) {
            const prompt = await generate_diff_review_prompt(diff, pr_payload, rules);
            const diffReview = await invoke_diff_review_llm(prompt, file_diff.to);
            reviews.push(diffReview);
        }
        
        if (reviews.length > 0) {
            file_diff_reviews.push({
                filename: file_diff.to,
                reviews: reviews,
            });
        }
    }

    console.log("Completed generate_pr_reviews");
    return file_diff_reviews;
}