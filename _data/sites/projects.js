module.exports = {
	name: "speedlify", // optional, falls back to object key
	description: "Pages, Prototypes, Projects",
	unordered: true,
	// skip if localhost
	// skip: !process.env.CONTEXT,
	skip: false,
	options: {
		// frequency: 60 * 23, // 24 hours
		// Use "run" if the sites don’t share assets on the same origin
		//           and we can reset chrome with each run instead of
		//           each site in every run (it’s faster)
		// Use "site" if sites are all on the same origin and share assets.
	},
	urls: [
		"https://gyam.smth.ooo/",
		"https://uninstall.tech/",
		"https://manifesto.smth.uk/",
		"https://elisted.org/",
		"https://typescale.io/",
		"https://propernoun.smth.uk/",
		"https://smth.uk/",
		"https://libty.smth.uk/",
		"https://c3css.com/",
		"https://hatecapitalism.com/",
		"https://36q.app/",
		"https://samsmith.uk",
		"https://preparingforzombies.zmbi.uk",
		"https://rethink.wtf",
		"https://browser-clock.mintcanary.com",
		"https://samsmith.name"
	],
};
