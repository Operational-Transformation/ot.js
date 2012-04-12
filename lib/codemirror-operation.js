(function () {
  // Monkey patching, yay!

  // The oldValue is needed to find
  ot.Operation.prototype.fromCodeMirrorChange = function (change, oldValue) {
    var operation = this;
    // Holds the current value
    var lines = oldValue.split('\n');

    // Given a { line, ch } object, return the index into the string represented
    // by the current lines object.
    function indexFromPos (pos) {
      var line = pos.line, ch = pos.ch;
      var index = 0;
      for (var i = 0; i < pos.line; i++) {
        index += lines[i].length + 1;
      }
      index += ch;
      return index;
    }

    // The number of characters in the current lines array + number of newlines.
    function getLength () {
      var length = 0;
      for (var i = 0, l = lines.length; i < l; i++) {
        length += lines[i].length;
      }
      return length + lines.length - 1; // include '\n's
    }

    // Returns the substring of the current lines array in the range given by
    // 'from' and 'to' which must be { line, ch } objects
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

    // Replace the range defined by 'from' and 'to' by 'text' (array of lines).
    // Alters the lines array.
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

    // Convert a single CodeMirror change to an operation. Assumes that lines
    // represents the state of the document before the CodeMirror change took
    // place. Alters the lines array so that it represents the document's
    // content after the change.
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

    // Convert the first element of the linked list of changes to an operation.
    generateOperation(operation, change);
    //oldValue = operation.apply(oldValue);
    //assert(oldValue === lines.join('\n'));

    // handle lists of operations by doing a left-fold over the linked list,
    // convert each change to an operation and composing it.
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
  };

  // Apply an operation to a CodeMirror instance.
  ot.Operation.prototype.applyToCodeMirror = function (cm) {
    var operation = this;
    cm.operation(function () {
      var ops = operation.ops;
      var index = 0; // holds the current index into CodeMirror's content
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
          // Check if the deleted characters match CodeMirror's content
          assert(cm.getRange(from, to) === op.delete);
          cm.replaceRange('', from, to);
        }
      }
      // Check that the operation spans the whole content
      assert(index === cm.getValue().length);
    });
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

})();