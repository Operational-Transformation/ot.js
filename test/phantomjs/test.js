/*global test, asyncTest, ok, start, ot, expect, CodeMirror */

asyncTest("converting between CodeMirror changes and operations", function () {
  function randomInt (n) {
    return Math.floor(Math.random() * n);
  }

  function randomChar () {
    if (Math.random() < 0.2) { return '\n'; }
    return String.fromCharCode(97 + randomInt(26));
  }

  function randomString () {
    if (Math.random() < 0.2) { return ''; }
    var l = 3 + randomInt(10);
    var str = '';
    while (l--) {
      str += randomChar();
    }
    return str;
  }

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

  function test () {
    var str = 'lorem ipsum';

    var oldValue = str;
    var cm1 = CodeMirror(document.body, { value: str });
    cm1.on('change', function (_, change) {
      var operation = ot.TextOperation.fromCodeMirrorChange(change, oldValue);
      //console.log(change, operation);
      operation.applyToCodeMirror(cm2);
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
  }

  test();
});