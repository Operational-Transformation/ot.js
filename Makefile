dist/ot-min.js: lib/operation.js lib/client.js
	cat lib/operation.js lib/client.js | uglifyjs -nc > dist/ot-min.js