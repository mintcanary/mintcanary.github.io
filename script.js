class Island extends HTMLElement {
  static tagName = "is-land";

  constructor() {
    super();

    this.attrs = {
      autoInitType: "autoinit",
      import: "import",
      fallback: "fallback",
      scriptType: "module/island",
      template: "data-island"
    };

    this.conditionMap = {
      visible: Conditions.waitForVisible,
      idle: Conditions.waitForIdle,
      interaction: Conditions.waitForInteraction,
      media: Conditions.waitForMedia,
      "save-data": Conditions.checkSaveData,
    };

    // Internal promises
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  static getParents(el, selector) {
    let nodes = [];
    while(el) {
      if(el.matches && el.matches(selector)) {
        nodes.push(el);
      }
      el = el.parentNode;
    }
    return nodes;
  }

  static async ready(el) {
    let parents = Island.getParents(el, Island.tagName);
    let imports = await Promise.all(parents.map(el => el.wait()));

    // return innermost module import
    if(imports.length) {
      return imports[0];
    }
  }

  async forceFallback() {
    let prefix = "is-island-waiting--";
    let extraSelector = this.fallback ? this.fallback : "";
    // Reverse here as a cheap way to get the deepest nodes first
    let components = Array.from(this.querySelectorAll(`:not(:defined)${extraSelector ? `,${extraSelector}` : ""}`)).reverse();
    let promises = [];

    // with thanks to https://gist.github.com/cowboy/938767
    for(let node of components) {
      if(!node.isConnected || node.localName === Island.tagName) {
        continue;
      }

      // assign this before we remove it from the document
      let readyP = Island.ready(node);

      // Special case for img just removes the src to preserve aspect ratio while loading
      if(node.localName === "img") {
        let attr = prefix + "src";
        // remove
        node.setAttribute(attr, node.getAttribute("src"));
        node.setAttribute("src", `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>`);

        promises.push(readyP.then(() => {
          // restore
          node.setAttribute("src", node.getAttribute(attr));
          node.removeAttribute(attr);
        }));
      } else { // everything else renames the tag
        // remove from document to prevent web component init
        let cloned = document.createElement(prefix + node.localName);
        for(let attr of node.getAttributeNames()) {
          cloned.setAttribute(attr, node.getAttribute(attr));
        }

        let children = Array.from(node.childNodes);
        for(let child of children) {
          cloned.append(child); // Keep the *same* child nodes, clicking on a details->summary child should keep the state of that child
        }
        node.replaceWith(cloned);

        promises.push(readyP.then(() => {
          // restore children (not cloned)
          for(let child of Array.from(cloned.childNodes)) {
            node.append(child);
          }
          cloned.replaceWith(node);
        }));
      }
    }

    return promises;
  }

  wait() {
    return this.ready;
  }

  getConditions() {
    let map = {};
    for(let key of Object.keys(this.conditionMap)) {
      if(this.hasAttribute(`on:${key}`)) {
        map[key] = this.getAttribute(`on:${key}`);
      }
    }

    return map;
  }

  async connectedCallback() {
    this.fallback = this.getAttribute(this.attrs.fallback)
    this.autoInitType = this.getAttribute(this.attrs.autoInitType);

    // Keep fallback content without initializing the components
    // TODO improvement: only run this for not-eager components?
    await this.forceFallback();

    await this.hydrate();
  }

  getInitScripts() {
    return this.querySelectorAll(`:scope script[type="${this.attrs.scriptType}"]`);
  }

  getTemplates() {
    return this.querySelectorAll(`:scope template[${this.attrs.template}]`);
  }

  replaceTemplates(templates) {
    // replace <template> with the live content
    for(let node of templates) {
      // get rid of the rest of the content on the island
      if(node.getAttribute(this.attrs.template) === "replace") {
        let children = Array.from(this.childNodes);
        for(let child of children) {
          this.removeChild(child);
        }
        this.appendChild(node.content);
        break;
      } else {
        node.replaceWith(node.content);
      }
    }
  }

  async hydrate() {
    let conditions = [];
    if(this.parentNode) {
      // wait for all parents before hydrating
      conditions.push(Island.ready(this.parentNode));
    }
    let attrs = this.getConditions();
    for(let condition in attrs) {
      if(this.conditionMap[condition]) {
        conditions.push(this.conditionMap[condition](attrs[condition], this));
      }
    }
    // Loading conditions must finish before dependencies are loaded
    await Promise.all(conditions);

    this.replaceTemplates(this.getTemplates());

    let mod;
    // [dependency="my-component-code.js"]
    let importScript = this.getAttribute(this.attrs.import);
    if(importScript) {
      // we could resolve import maps here manually but you’d still have to use the full URL in your script’s import anyway
      mod = await import(importScript);
    }

    // do nothing if has script[type="module/island"], will init manually in script via ready()
    let initScripts = this.getInitScripts();

    if(initScripts.length > 0) {
      // activate <script type="module/island">
      for(let old of initScripts) {
        let script = document.createElement("script");
        script.setAttribute("type", "module");
        // Idea: *could* modify this content to retrieve access to the modules therein
        script.textContent = old.textContent;
        old.replaceWith(script);
      }
    } else if(mod) {
      let autoInitType = this.autoInitType || importScript;
      if(autoInitType === "petite-vue" || autoInitType === "vue") {
        mod.createApp().mount(this);
      }
    }

    // When using <script type="module/island"> `readyResolve` will fire before any internal imports finish!
    this.readyResolve({
      import: mod
    });
  }
}

class Conditions {
  static waitForVisible(noop, el) {
    if(!('IntersectionObserver' in window)) {
      // runs immediately
      return;
    }

    return new Promise(resolve => {
      let observer = new IntersectionObserver(entries => {
        let [entry] = entries;
        if(entry.isIntersecting) {
          observer.unobserve(entry.target);
          resolve();
        }
      });

      observer.observe(el);
    });
  }

  static waitForIdle() {
    let onload = new Promise(resolve => {
      if(document.readyState !== "complete") {
        window.addEventListener("load", () => resolve(), { once: true });
      } else {
        resolve();
      }
    });

    if(!("requestIdleCallback" in window)) {
      // run immediately
      return onload;
    }

    // both idle and onload
    return Promise.all([
      new Promise(resolve => {
        requestIdleCallback(() => {
          resolve();
        });
      }),
      onload,
    ]);
  }

  static waitForInteraction(eventOverrides, el) {
    let events = ["click", "touchstart"];
    // event overrides e.g. on:interaction="mouseenter"
    if(eventOverrides) {
      events = (eventOverrides || "").split(",");
    }

    return new Promise(resolve => {
      function resolveFn(e) {
        resolve();

        // cleanup the other event handlers
        for(let name of events) {
          el.removeEventListener(name, resolveFn);
        }
      }

      for(let name of events) {
        el.addEventListener(name, resolveFn, { once: true });
      }
    });
  }

  static waitForMedia(query) {
    let mm = {
      matches: true
    };

    if(query && ("matchMedia" in window)) {
      mm = window.matchMedia(query);
    }

    if(mm.matches) {
      return;
    }

    return new Promise(resolve => {
      mm.addListener(e => {
        if(e.matches) {
          resolve();
        }
      });
    });
  }

  static checkSaveData(expects) {
    if("connection" in navigator && navigator.connection.saveData === (expects !== "false")) {
      return Promise.resolve();
    }

    // dangly promise
    return new Promise(() => {});
  }
}

// Should this auto define? Folks can redefine later using { component } export
if("customElements" in window) {
  window.customElements.define(Island.tagName, Island);
}

;(function() {
	if(!("customElements" in window) || !("fetch" in window)) {
		return;
	}

	const NAME = "speedlify-score";

	class SpeedlifyUrlStore {
		constructor() {
			this.fetches = {};
			this.responses = {};
			this.urls = {};
		}

		static normalizeUrl(speedlifyUrl, path) {
			let host = `${speedlifyUrl}${speedlifyUrl.endsWith("/") ? "" : "/"}`
			return host + (path.startsWith("/") ? path.substr(1) : path);
		}

		async fetch(speedlifyUrl, url) {
			if(this.urls[speedlifyUrl]) {
				return this.urls[speedlifyUrl][url] ? this.urls[speedlifyUrl][url].hash : false;
			}

			if(!this.fetches[speedlifyUrl]) {
				this.fetches[speedlifyUrl] = fetch(SpeedlifyUrlStore.normalizeUrl(speedlifyUrl, "api/urls.json"));
			}

			let response = await this.fetches[speedlifyUrl];

			if(!this.responses[speedlifyUrl]) {
				this.responses[speedlifyUrl] = response.json();
			}

			let json = await this.responses[speedlifyUrl];

			this.urls[speedlifyUrl] = json;

			return json[url] ? json[url].hash : false;
		}
	}

	const urlStore = new SpeedlifyUrlStore();

	customElements.define(NAME, class extends HTMLElement {
		connectedCallback() {
			this.speedlifyUrl = this.getAttribute("speedlify-url");
			this.shorthash = this.getAttribute("hash");
			this.rawData = this.getAttribute("raw-data");
			this.url = this.getAttribute("url") || window.location.href;
			this.urlStore = urlStore;

			if(!this.rawData && !this.speedlifyUrl) {
				console.log(`Missing \`speedlify-url\` attributes in <${NAME}>`);
				return;
			}

			// lol async in constructors
			this.init();
		}

		async init() {
			if(this.rawData) {
				let data = JSON.parse(this.rawData);
				this.setTimeAttributes(data);
				this.innerHTML = this.render(data);
				return;
			}

			let hash = this.shorthash;
			if(!hash) {
				// It’s much faster if you supply a `hash` attribute!
				hash = await this.urlStore.fetch(this.speedlifyUrl, this.url);
			}

			if(!hash) {
				console.error( `<${NAME}> could not find hash for URL: ${this.url}` );
				return;
			}

			let data = await this.fetchData(hash);
			this.setTimeAttributes(data);
			this.innerHTML = this.render(data);
		}

		async fetchData(hash) {
			let response = await fetch(SpeedlifyUrlStore.normalizeUrl(this.speedlifyUrl, `api/${hash}.json`));
			let json = await response.json();

			return json;
		}

		setTimeAttributes(data) {
			if(data.timestamp) {
				this.setAttribute("title", `Results from ${this.timeAgo(data.timestamp)}`);
				this.setAttribute("data-timestamp", data.timestamp)
			}
		}

		timeAgo(timestamp) {
			let days = Math.floor((new Date() - timestamp) / (1000*60*60*24));
			return `${days} day${days != 1 ? "s" : ""} ago`;
		}

		getScoreClass(score) {
			if(score < .5) {
				return "speedlify-score speedlify-score-bad";
			}
			if(score < .9) {
				return "speedlify-score speedlify-score-ok";
			}
			return "speedlify-score speedlify-score-good";
		}

		getScoreTemplate(data) {
			let scores = [];
			scores.push(`<span title="Performance" class="${this.getScoreClass(data.lighthouse.performance)}">${parseInt(data.lighthouse.performance * 100, 10)}</span>`);
			scores.push(`<span title="Accessibility" class="${this.getScoreClass(data.lighthouse.accessibility)}">${parseInt(data.lighthouse.accessibility * 100, 10)}</span>`);
			scores.push(`<span title="Best Practices" class="${this.getScoreClass(data.lighthouse.bestPractices)}">${parseInt(data.lighthouse.bestPractices * 100, 10)}</span>`);
			scores.push(`<span title="SEO" class="${this.getScoreClass(data.lighthouse.seo)}">${parseInt(data.lighthouse.seo * 100, 10)}</span>`);
			return scores.join(" ");
		}

		render(data) {
			let content = [];
			let scoreHtml = this.getScoreTemplate(data);
			if(!this.hasAttribute("requests") && !this.hasAttribute("weight") && !this.hasAttribute("rank") || this.hasAttribute("score")) {
				content.push(scoreHtml);
			}

			let summarySplit = data.weight.summary.split(" • ");
			if(this.hasAttribute("requests")) {
				content.push(`<span class="speedlify-requests">${summarySplit[0]}</span>`);
			}
			if(this.hasAttribute("weight")) {
				content.push(`<span class="speedlify-weight">${summarySplit[1]}</span>`);
			}
			if(this.hasAttribute("rank")) {
				let rankUrl = this.getAttribute("rank-url");
				content.push(`<${rankUrl ? `a href="${rankUrl}"` : "span"} class="speedlify-rank">${data.ranks.cumulative}</${rankUrl ? "a" : "span"}>`);
			}
			if(this.hasAttribute("rank-change") && data.previousRanks) {
				let change = data.previousRanks.cumulative - data.ranks.cumulative;
				content.push(`<span class="speedlify-rank-change ${change > 0 ? "up" : (change < 0 ? "down" : "same")}">${change !== 0 ? Math.abs(change) : ""}</span>`);
			}

			return content.join("");
		}
	});
})();
function makeTable(table) {
  let labels = [];
  let series = [];

  let rows = Array.from(table.querySelectorAll(":scope tbody tr"));
  let minY = 90;
  let maxY = 100;
  rows = rows.reverse();

  for(let row of rows) {
    let label = row.children[0].innerText.split(" ");
    labels.push(label.slice(0,2).join(" "));
    let childCount = row.children.length - 1;
    let seriesIndex = 0;
    for(let j = 0, k = childCount; j<k; j++) {
      let data = row.children[j + 1].dataset;
      if(data && data.numericValue) {
        minY = Math.min(data.numericValue, minY);
        maxY = Math.max(data.numericValue, maxY);
        if(!series[seriesIndex]) {
          series[seriesIndex] = [];
        }
        series[seriesIndex].push(data.numericValue);
        seriesIndex++;
      }
    }
  }

  let options = {
    high: Math.max(maxY, 100),
    low: Math.max(0, minY - 5),
    fullWidth: true,
    onlyInteger: true,
    showPoint: false,
    lineSmooth: true,
    axisX: {
      showGrid: true,
      showLabel: true
    },
    chartPadding: {
      right: 40
    }
  };

  new Chartist.Line(table.parentNode.nextElementSibling, {
    labels: labels,
    series: series
  }, options);
}

function initializeAllTables(scope) {
  let tables = scope.querySelectorAll("[data-make-chart]");
  for(let table of tables) {
    // make sure not in a closed details
    if(table.closest("details[open]") || !table.closest("details")) {
      makeTable(table);
    }
  }
}

initializeAllTables(document);

let details = document.querySelectorAll("details");
// let first = true;
for(let detail of details) {
  // open the first details by default
  // if(first) {
  //   detail.open = true;
  //   first = false;
  // }
  detail.addEventListener("toggle", function(e) {
    let open = e.target.hasAttribute("open");
    if(open) {
      initializeAllTables(e.target);
    }
    let row = e.target.closest(".leaderboard-list-entry-details");
    row.classList.toggle("expanded", open);
    row.previousElementSibling.classList.toggle("expanded", open);
  });
}

let expandAliases = document.querySelectorAll("[data-expand-alias]");
for(let alias of expandAliases) {
  alias.addEventListener("click", function(e) {
    e.preventDefault();
    let href = e.target.closest("a[href]").getAttribute("href");
    if(href) {
      let details = document.querySelector(href);
      if(details) {
        details.open = !details.hasAttribute("open");
      }
    }
  }, false);
}

;(function() {
	if(!("customElements" in window) || !("Intl" in window) || !Intl.RelativeTimeFormat) {
		return;
	}
	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

	customElements.define("timestamp-ago", class extends HTMLElement {
		connectedCallback() {
			let timestamp = this.getAttribute("timestamp");
			if(timestamp) {
				let date = (new Date()).setTime(timestamp);
				let diff = Math.floor((date - Date.now())/(1000 * 60 * 60));
				this.setAttribute("title", this.innerText);
				this.innerText = rtf.format(diff, "hour");
			}
		}
	});
})();
