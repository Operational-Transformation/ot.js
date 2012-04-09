function codeMirrorChangeToOperation (operation, cm, change, oldValue) {
  var lines = oldValue.split('\n');

  function indexFromPos (pos) {
    var line = pos.line, ch = pos.ch;
    var index = 0;
    for (var i = 0; i < pos.line; i++) {
      index += lines[i].length + 1;
    }
    index += ch;
    return index;
  }

  function getLength () {
    var length = 0;
    for (var i = 0, l = lines.length; i < l; i++) {
      length += lines[i].length;
    }
    return length + lines.length - 1; // include '\n's
  }

  function getRange (from, to) {
    // Precondition: to ">" from
    if (from.line === to.line) {
      return lines[from.line].slice(from.ch, to.ch);
    }
    var str = lines[from.line].slice(from.ch) + '\n';
    for (var i = from.line + 1; i < to.line; i++) {
      str += lines[i] + '\n';
    }
    str += lines[to.line].slice(0, to.ch);
    return str;
  }

  function replaceRange (text, from, to) {
    // Precondition: to ">" from
    var strLines = text.slice(0); // copy
    var pre = lines[from.line].slice(0, from.ch);
    var post = lines[to.line].slice(to.ch);
    strLines[0] = pre + strLines[0];
    strLines[strLines.length-1] += post;

    strLines.unshift(to.line - from.line + 1); // 2nd positional parameter
    strLines.unshift(from.line); // 1st positional parameter
    lines.splice.apply(lines, strLines);
  }

  function generateOperation (operation, change) {
    var from   = indexFromPos(change.from);
    var to     = indexFromPos(change.to);
    var length = getLength();
    operation.retain(from);
    operation.delete(getRange(change.from, change.to));
    operation.insert(change.text.join('\n'));
    operation.retain(length - to);
    replaceRange(change.text, change.from, change.to);
  }

  generateOperation(operation, change);
  //oldValue = operation.apply(oldValue);
  //assert(oldValue === lines.join('\n'));
  while (true) {
    //assert(operation.targetLength === getLength());
    change = change.next;
    if (!change) { break; }
    var nextOperation = new ot.Operation(operation.revision + 1);
    generateOperation(nextOperation, change);
    //oldValue = nextOperation.apply(oldValue);
    //assert(oldValue === lines.join('\n'));
    operation = operation.compose(nextOperation);
  }

  return operation;
}

/*
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
*/

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