import Fetch from "@11ty/eleventy-fetch";

export default async function () {
	let url = "https://mintcanary.com/speedlify2/api/group/websites.json";

	let json = await Fetch(url, {
		duration: "1d", // save for 1 day
		type: "json", // we’ll parse JSON for you
	});

	return json;
}
