/*global test, asyncTest, ok, start, ot, expect, CodeMirror, randomString, randomInt */

(function () {

  var TextOperation     = ot.TextOperation;
  var CodeMirrorAdapter = ot.CodeMirrorAdapter;

  function randomEdit (cm) {
    var length = cm.getValue().length;
    var start = randomInt(length);
    var startPos = cm.posFromIndex(start);
    var end = start + randomInt(Math.min(10, length - start));
    var endPos = cm.posFromIndex(end);
    var newContent = randomString();
    cm.replaceRange(newContent, startPos, endPos);
  }

  function randomChange (cm) {
    var n = 1 + randomInt(3);
    while (n--) {
      randomEdit(cm);
    }
  }

  function randomOperation (cm) {
    cm.operation(function () {
      randomChange(cm);
    });
  }

  asyncTest("converting between CodeMirror changes and operations", function () {
    var str = 'lorem ipsum';

    var oldValue = str;
    var cm1 = CodeMirror(document.body, { value: str });
    cm1.on('change', function (_, change) {
      var operation = CodeMirrorAdapter.operationFromCodeMirrorChange(change, oldValue);
      //console.log(change, operation);
      CodeMirrorAdapter.applyOperationToCodeMirror(operation, cm2);
      oldValue = cm1.getValue();
    });

    var cm2 = CodeMirror(document.body, { value: str });

    var n = 100;
    expect(n);

    function step () {
      while (n--) {
        randomOperation(cm1);
        var v1 = cm1.getValue();
        var v2 = cm2.getValue();
        ok(v1 === v2, "the contents of both CodeMirror instances should be equal");

        if (n % 10 === 0) {
          setTimeout(step, 10); // give the browser a chance to repaint
          break;
        }
      }
      if (n === 0) { start(); }
    }
    step();
  });

  test("should trigger the 'change' event when the user makes an edit", function () {
    var cm = CodeMirror(document.body, { value: "lorem ipsum" });
    var cmAdapter = new CodeMirrorAdapter(cm);
    var oldValues = [];
    var operations = [];
    cmAdapter.registerCallbacks({
      change: function (oldValue, operation) {
        oldValues.push(oldValue);
        operations.push(operation);
      }
    });
    var edit1 = new TextOperation().retain(11).insert(" dolor");
    CodeMirrorAdapter.applyOperationToCodeMirror(edit1, cm);
    ok(oldValues.shift() === "lorem ipsum");
    ok(operations.shift().equals(edit1));

    var edit2 = new TextOperation()['delete'](1).retain(16);
    CodeMirrorAdapter.applyOperationToCodeMirror(edit2, cm);
    ok(oldValues.shift() === "lorem ipsum dolor");
    ok(operations.shift().equals(edit2));

    ok(oldValues.length === 0);
    ok(operations.length === 0);
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

  // TODO:
  // * trigger 'cursorActivity' (and ordering with 'change' event)
  // * setCursor
  // * getCursor
  // * setOtherCursor

}());