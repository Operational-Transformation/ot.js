function codeMirrorChangeToOperation (operation, cm, change, oldValue) {
  var newValue = cm.getValue();
  var from = cm.indexFromPos(change.from);
  var text = change.text.join('\n');
  var diff = newValue.length - oldValue.length;
  var deletedChars = text.length - diff;

  operation.retain(from);
  if (deletedChars > 0) {
    operation.delete(oldValue.slice(from, from + deletedChars));
  }
  operation.insert(text);
  if (oldValue.length - operation.baseLength > 0) {
    operation.retain(oldValue.length - operation.baseLength);
  }

  return operation;
}

function codeMirrorApplyOperation (cm, operation) {
  cm.operation(function () {
    var ops = operation.ops;
    var index = 0;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        index += op.retain;
      } else if (op.insert) {
        cm.replaceRange(op.insert, cm.posFromIndex(index));
        index += op.insert.length;
      } else if (op.delete) {
        var from = cm.posFromIndex(index);
        var to   = cm.posFromIndex(index + op.delete.length);
        assert(cm.getRange(from, to) === op.delete);
        cm.replaceRange('', from, to);
      }
    }
    assert(index === cm.getValue().length);
  });
}

function assert (b, msg) {
  if (!b) {
    throw new Error(msg || "assertion error");
  }
}