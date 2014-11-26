/*global test, asyncTest, ok, start, ot, expect, CodeMirror, randomString, randomInt, deepEqual */

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

  test("should trigger the 'selectionChange' event when the cursor position or selection changes", function () {
    var doc = "hllo world!";
    var cm = CodeMirror(document.body, { value: doc });
    var cmAdapter = new CodeMirrorAdapter(cm);
    cm.setCursor({ line: 0, ch: 5 });

    var change = false;
    var selection = null;
    cmAdapter.registerCallbacks({
      change: function () {
        change = true;
      },
      selectionChange: function () {
        ok(change);
        selection = cm.listSelections();
      }
    });

    cm.replaceRange("e", { line: 0, ch: 1 }, { line: 0, ch: 1 });
    ok(selection.length === 1);
    deepEqual(selection[0].from(), new CodeMirror.Pos(0, 6), "the cursor should be on position 6");
    deepEqual(selection[0].to(), new CodeMirror.Pos(0, 6), "the cursor should be on position 6");

    change = true;
    var anchor = new CodeMirror.Pos(0, 12);
    var head = new CodeMirror.Pos(0, 6);
    cm.setSelection(anchor, head);
    ok(selection.length === 1);
    deepEqual(selection[0].from(), head, "the selection should start on position 0");
    deepEqual(selection[0].to(), anchor, "the selection should end on position 12");
  });

  test("should trigger the 'blur' event when CodeMirror loses its focus", function () {
    var cm = CodeMirror(document.body, { value: "Hallo Welt!" });
    cm.focus();
    var cmAdapter = new CodeMirrorAdapter(cm);
    var blurred = false;
    cmAdapter.registerCallbacks({
      blur: function () { blurred = true; }
    });

    var textField = document.createElement('input');
    textField.type = 'text';
    textField.value = "Dies ist ein Textfeld";
    document.body.appendChild(textField);
    textField.focus();
    ok(blurred);
    document.body.removeChild(textField);
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

  test("setOtherSelection", function () {
    var doc = "guten tag!\nlorem ipsum dolor";
    var cm = CodeMirror(document.body, { value: doc });
    var cmAdapter = new CodeMirrorAdapter(cm);
    var selection1 = new Selection([new Range(3,3), new Range(9,16)]);
    var handle1 = cmAdapter.setOtherSelection(selection1, '#ff0000', 'tim');
    deepEqual(cm.getAllMarks().map(function (x) { return x.find(); }), [
      new CodeMirror.Pos(0, 3),
      { from: new CodeMirror.Pos(0, 9), to: new CodeMirror.Pos(1, 5) }
    ], "the codemirror instance should contain the other user's selection as marks");
    var selection2 = new Selection([new Range(4,6)]);
    var handle2 = cmAdapter.setOtherSelection(selection2, '#0000ff', 'tim');
    deepEqual(cm.getAllMarks().map(function (x) { return x.find(); }), [
      new CodeMirror.Pos(0, 3),
      { from: new CodeMirror.Pos(0, 9), to: new CodeMirror.Pos(1, 5) },
      { from: new CodeMirror.Pos(0, 4), to: new CodeMirror.Pos(0, 6) }
    ], "the codemirror instance should contain the other users' selection as marks");
    handle1.clear();
    deepEqual(cm.getAllMarks().map(function (x) { return x.find(); }), [
      { from: new CodeMirror.Pos(0, 4), to: new CodeMirror.Pos(0, 6) }
    ], "the codemirror instance should contain the other users' selection as marks");
    handle2.clear();
    deepEqual(cm.getAllMarks().map(function (x) { return x.find(); }), [],
      "the codemirror instance should contain no more marks");
  });

}());