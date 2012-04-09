(function () {
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
    var cm1 = CodeMirror(document.body, {
      value: str,
      onChange: function (_, change) {
        var operation = new ot.Operation(0);
        operation = codeMirrorChangeToOperation(operation, cm1, change, oldValue);
        console.log(change, operation);
        codeMirrorApplyOperation(cm2, operation);
        oldValue = cm1.getValue();
      }
    });

    var cm2 = CodeMirror(document.body, {
      value: str
    });

    var n = 50;
    while (n--) {
      randomOperation(cm1);
      var v1 = cm1.getValue();
      var v2 = cm2.getValue();
      if (v1 !== v2) {
        throw new Error('"' + v1 + '"\n\n!==\n\n"' + v2 + '"');
      }
    }
  }

  test();
})();