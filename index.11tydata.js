const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const cssFile = path.join(__dirname, `_includes/styles/index.scss`);

async function fetchCSS() {
  return fs.readFileSync(cssFile);
}

module.exports = async function() {
  let file = cssFile;
  let css = await fetchCSS();

  return await postcss([
    require('@csstools/postcss-sass'),
    require('autoprefixer'),
    require('cssnano')
  ])
  .process(css, { from: file })
  .then(result => {
    return {
      css: result.css
    }
  });
};
