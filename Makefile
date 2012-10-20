docs: docs/*.rst
	cd docs && make html

dist: dist-cm

dist-core:
	@head -8 dist/ot.js > dist/ot.tmp
	@for file in  \
	  lib/text-operation.js  \
	  lib/cursor.js  \
	  lib/wrapped-operation.js  \
	  lib/undo-manager.js  \
	  lib/client.js  \
	; do echo >> dist/ot.tmp && cat $$file >> dist/ot.tmp ; done
	@mv dist/ot.tmp dist/ot.js

dist-cm: dist-core
	@for file in  \
	  lib/codemirror-operation.js  \
	  lib/codemirror-client.js  \
	; do echo >> dist/ot.js && cat $$file >> dist/ot.js ; done

.PHONY: docs dist dist-core dist-cm
