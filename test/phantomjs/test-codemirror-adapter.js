/*global test, asyncTest, ok, start, ot, expect, CodeMirror, randomString, randomInt */

(function () {

  var Selection         = ot.Selection;
  var Range             = Selection.Range;
  var TextOperation     = ot.TextOperation;
  var CodeMirrorAdapter = ot.CodeMirrorAdapter;

  function randomEdit (cm) {
    var length = cm.getValue().length;
    var start = randomInt(length);
    var startPos = cm.posFromIndex(start);
    var end = start + randomInt(Math.min(10, length - start));
    var endPos = cm.posFromIndex(end);
    var newContent = Math.random() > 0.5 ? '' : randomString(randomInt(12));
    cm.replaceRange(newContent, startPos, endPos);
  }

  function randomChange (cm) {
    var n = 1 + randomInt(4);
    while (n--) {
      randomEdit(cm);
    }
  }

  function randomOperation (cm) {
    cm.operation(function () {
      randomChange(cm);
    });
  }

  function getDocLength (doc) {
    return doc.indexFromPos({ line: doc.lastLine(), ch: 0 }) +
      doc.getLine(doc.lastLine()).length;
  }

  asyncTest("converting between CodeMirror changes and operations", function () {
    var str = 'lorem ipsum';

    var cm1 = CodeMirror(document.body, { value: str });
    cm1.on('changes', function (_, changes) {
      var pair = CodeMirrorAdapter.operationFromCodeMirrorChanges(changes, cm1);
      var operation = pair[0];
      CodeMirrorAdapter.applyOperationToCodeMirror(operation, cm2);
    });

    var cm2 = CodeMirror(document.body, { value: str });

    var n = 100;
    expect(n);

    function step () {
      while (n--) {
        randomOperation(cm1);
        var v1 = cm1.getValue();
        var v2 = cm2.getValue();
        if (v1 !== v2) {
          ok(false, "the contents of both CodeMirror instances should be equal");
          start();
          return;
        }
        ok(true, "the contents of both CodeMirror instances should be equal");

        if (n % 10 === 0) {
          setTimeout(step, 10); // give the browser a chance to repaint
          break;
        }
      }
      if (n === 0) { start(); }
    }
    step();
  });

  function randomSelection (n) {
    if (Math.random() < 0.3) {
      return Selection.createCursor(randomInt(n));
    } else {
      var ranges = [];
      var i = randomInt(Math.ceil(n/4));
      while (i < n) {
        var from = i;
        i += 1 + randomInt(Math.ceil(n/8));
        var to = Math.min(i, n);
        var range = Math.random() < 0.5 ? new Range(from, to) : new Range(to, from);
        ranges.push(range);
        i += 1 + randomInt(Math.ceil(n/4));
      }
      return new Selection(ranges);
    }
  }

  test("getSelection and setSelection", function () {
    var n = 200;
    var doc = randomString(n);
    var cm = CodeMirror(document.body, { value: doc });
    var cmAdapter = new CodeMirrorAdapter(cm);

    var j = 50;
    while (j--) {
      var selection = randomSelection(n);
      cmAdapter.setSelection(selection);
      ok(selection.equals(cmAdapter.getSelection()));
    }
  });

  test("should trigger the 'change' event when the user makes an edit", function () {
    var cm = CodeMirror(document.body, { value: "lorem ipsum" });
    var cmAdapter = new CodeMirrorAdapter(cm);
    var operations = [];
    var inverses = [];
    cmAdapter.registerCallbacks({
      change: function (operation, inverse) {
        operations.push(operation);
        inverses.push(inverse);
      }
    });
    var edit1 = new TextOperation().retain(11).insert(" dolor");
    CodeMirrorAdapter.applyOperationToCodeMirror(edit1, cm);
    ok(operations.shift().equals(edit1));
    ok(inverses.shift().equals(edit1.invert("lorem ipsum")));

    var edit2 = new TextOperation()['delete'](1).retain(16);
    CodeMirrorAdapter.applyOperationToCodeMirror(edit2, cm);
    ok(operations.shift().equals(edit2));
    ok(inverses.shift().equals(edit2.invert("lorem ipsum dolor")));

    ok(operations.length === 0);
    ok(inverses.length === 0);
  });

  test("applyOperation should apply the operation to CodeMirror, but not trigger an event", function () {
    var doc = "nanana";
    var cm = CodeMirror(document.body, { value: doc });
    var cmAdapter = new CodeMirrorAdapter(cm);
    cmAdapter.registerCallbacks({
      change: function () {
        throw new Error("change shouldn't be called!");
      }
    });
    cmAdapter.applyOperation(new TextOperation().retain(6).insert("nu"));
    ok(cm.getValue() === cmAdapter.getValue());
    ok(cmAdapter.getValue() === "nanananu");
  });

  test("getValue", function () {
    var doc = "guten tag";
    var cm = CodeMirror(document.body, { value: doc });
    var cmAdapter = new CodeMirrorAdapter(cm);
    CodeMirrorAdapter.applyOperationToCodeMirror(new TextOperation()['delete'](1).insert("G").retain(8), cm);
    ok(cmAdapter.getValue() === "Guten tag");
    cmAdapter.applyOperation(new TextOperation().retain(6)['delete'](1).insert("T").retain(2));
    ok(cmAdapter.getValue() === "Guten Tag");
  });

  test("register undo/redo", function () {
    var cm = CodeMirror(document.body, {});
    var cmAdapter = new CodeMirrorAdapter(cm);
    var undoFn = function () { return "undo!"; };
    var redoFn = function () { return "redo!"; };
    cmAdapter.registerUndo(undoFn);
    cmAdapter.registerRedo(redoFn);
    ok(cm.undo === undoFn);
    ok(cm.redo === redoFn);
  });

  test("detach", function () {
    var cm = CodeMirror(document.body, {});
    var cmAdapter = new CodeMirrorAdapter(cm);
    var changes = 0;
    cmAdapter.registerCallbacks({ change: function () { changes += 1; } });
    cm.setValue("42");
    ok(changes === 1);
    cmAdapter.detach();
    cm.setValue("23");
    ok(changes === 1);
  });

  // TODO:
  // * trigger 'cursorActivity' (and ordering with 'change' event)
  // * setOtherSelection

}());