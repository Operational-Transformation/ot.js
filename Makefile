dist/ot-min.js: lib/operation.js lib/client.js lib/codemirror-operation.js
	cat lib/operation.js lib/client.js lib/codemirror-operation.js | uglifyjs -nc > dist/ot-min.js