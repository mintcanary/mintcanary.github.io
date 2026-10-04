import { RenderPlugin } from "@11ty/eleventy";
import eleventySass from "@11tyrocks/eleventy-plugin-sass-lightningcss";

export default function (eleventyConfig) {
	// Plugins
	eleventyConfig.addPlugin(RenderPlugin);
	eleventyConfig.addPlugin(eleventySass);

	eleventyConfig.addFilter("displayUrl", function (url, keepWww = false) {
		if (!keepWww) {
			url = url.replace("https://www.", "");
		}
		url = url.replace("https://", "");
		if (url.endsWith("/index.html")) {
			url = url.replace("/index.html", "/");
		}
		return url.endsWith("/") ? url.slice(0, -1) : url;
	});

	eleventyConfig.addFilter("ratingEvaluation", function (percentage) {
		let evaluation = "good";

		if (percentage < 50) {
			evaluation = "bad";
		} else if (percentage < 90) {
			evaluation = "ok";
		}

		return evaluation;
	});

	// Pass through
	eleventyConfig.addPassthroughCopy("fonts");
	eleventyConfig.addPassthroughCopy("CNAME");
	eleventyConfig.addPassthroughCopy(".nojekyll");
}
