dist/ot.js: lib/text-operation.js lib/wrapped-operation.js lib/client.js lib/codemirror-operation.js lib/codemirror-client.js
	cat lib/text-operation.js lib/wrapped-operation.js lib/client.js lib/codemirror-operation.js lib/codemirror-client.js > dist/ot.js

dist/ot-min.js: dist/ot.js
	cat dist/ot.js | uglifyjs -nc > dist/ot-min.js

docs: docs/*.rst
	cd docs && make html

.PHONY: dist/ot-min.js docs