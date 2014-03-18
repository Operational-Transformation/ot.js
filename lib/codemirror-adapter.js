/*global ot */

ot.CodeMirrorAdapter = (function (global) {
  'use strict';

  var TextOperation = ot.TextOperation;
  var Cursor = ot.Cursor;

  function CodeMirrorAdapter (cm) {
    this.cm = cm;
    this.ignoreNextChange = false;

    bind(this, 'onChange');
    bind(this, 'onCursorActivity');
    bind(this, 'onFocus');
    bind(this, 'onBlur');

    if (global.CodeMirror && /^4\./.test(global.CodeMirror.version)) {
      cm.on('changes', this.onChange);
    } else {
      cm.on('change', this.onChange);
    }
    cm.on('cursorActivity', this.onCursorActivity);
    cm.on('focus', this.onFocus);
    cm.on('blur', this.onBlur);
  }

  // Removes all event listeners from the CodeMirror instance.
  CodeMirrorAdapter.prototype.detach = function () {
    this.cm.off('changes', this.onChange);
    this.cm.off('change', this.onChange);
    this.cm.off('cursorActivity', this.onCursorActivity);
    this.cm.off('focus', this.onFocus);
    this.cm.off('blur', this.onBlur);
  };

  function cmpPos (a, b) {
    if (a.line < b.line) { return -1; }
    if (a.line > b.line) { return 1; }
    if (a.ch < b.ch)     { return -1; }
    if (a.ch > b.ch)     { return 1; }
    return 0;
  }
  function posEq (a, b) { return cmpPos(a, b) === 0; }
  function posLe (a, b) { return cmpPos(a, b) <= 0; }

  function minPos (a, b) { return posLe(a, b) ? a : b; }
  function maxPos (a, b) { return posLe(a, b) ? b : a; }

  function codemirrorDocLength (doc) {
    return doc.indexFromPos({ line: doc.lastLine(), ch: 0 }) +
      doc.getLine(doc.lastLine()).length;
  }

  // Converts a CodeMirror change array (as obtained from the 'changes' event
  // in CodeMirror v4) or single change or linked list of changes (as returned
  // by the 'change' event in CodeMirror prior to version 4) into a
  // TextOperation and its inverse and returns them as a two-element array.
  CodeMirrorAdapter.operationFromCodeMirrorChanges = function (changes, doc) {
    // Approach: Replay the changes, beginning with the most recent one, and
    // construct the operation and its inverse. We have to convert the position
    // in the pre-change coordinate system to an index. We have a method to
    // convert a position in the coordinate system after all changes to an index,
    // namely CodeMirror's `indexFromPos` method. We can use the information of
    // a single change object to convert a post-change coordinate system to a
    // pre-change coordinate system. We can now proceed inductively to get a
    // pre-change coordinate system for all changes in the linked list.
    // A disadvantage of this approach is its complexity `O(n^2)` in the length
    // of the linked list of changes.

    // Handle single change objects and linked lists of change objects.
    var changeArray, i = 0;
    if (typeof changes.from === 'object') {
      changeArray = [];
      while (changes) {
        changeArray[i++] = changes;
        changes = changes.next;
      }
      changes = changeArray;
    }

    var docEndLength = codemirrorDocLength(doc);
    var operation    = new TextOperation().retain(docEndLength);
    var inverse      = new TextOperation().retain(docEndLength);

    var indexFromPos = function (pos) {
      return doc.indexFromPos(pos);
    };

    function last (arr) { return arr[arr.length - 1]; }

    function sumLengths (strArr) {
      if (strArr.length === 0) { return 0; }
      var sum = 0;
      for (var i = 0; i < strArr.length; i++) { sum += strArr[i].length; }
      return sum + strArr.length - 1;
    }

    function updateIndexFromPos (indexFromPos, change) {
      return function (pos) {
        if (posLe(pos, change.from)) { return indexFromPos(pos); }
        if (posLe(change.to, pos)) {
          return indexFromPos({
            line: pos.line + change.text.length - 1 - (change.to.line - change.from.line),
            ch: (change.to.line < pos.line) ?
              pos.ch :
              (change.text.length <= 1) ?
                pos.ch - (change.to.ch - change.from.ch) + sumLengths(change.text) :
                pos.ch - change.to.ch + last(change.text).length
          }) + sumLengths(change.removed) - sumLengths(change.text);
        }
        if (change.from.line === pos.line) {
          return indexFromPos(change.from) + pos.ch - change.from.ch;
        }
        return indexFromPos(change.from) +
          sumLengths(change.removed.slice(0, pos.line - change.from.line)) +
          1 + pos.ch;
      };
    }

    for (i = changes.length - 1; i >= 0; i--) {
      var change = changes[i];
      indexFromPos = updateIndexFromPos(indexFromPos, change);

      var fromIndex = indexFromPos(change.from);
      var restLength = docEndLength - fromIndex - sumLengths(change.text);

      operation = new TextOperation()
        .retain(fromIndex)
        ['delete'](sumLengths(change.removed))
        .insert(change.text.join('\n'))
        .retain(restLength)
        .compose(operation);

      inverse = inverse.compose(new TextOperation()
        .retain(fromIndex)
        ['delete'](sumLengths(change.text))
        .insert(change.removed.join('\n'))
        .retain(restLength)
      );

      docEndLength += sumLengths(change.removed) - sumLengths(change.text);
    }

    return [operation, inverse];
  };

  // Singular form for backwards compatibility.
  CodeMirrorAdapter.operationFromCodeMirrorChange =
    CodeMirrorAdapter.operationFromCodeMirrorChanges;

  // Apply an operation to a CodeMirror instance.
  CodeMirrorAdapter.applyOperationToCodeMirror = function (operation, cm) {
    cm.operation(function () {
      var ops = operation.ops;
      var index = 0; // holds the current index into CodeMirror's content
      for (var i = 0, l = ops.length; i < l; i++) {
        var op = ops[i];
        if (TextOperation.isRetain(op)) {
          index += op;
        } else if (TextOperation.isInsert(op)) {
          cm.replaceRange(op, cm.posFromIndex(index));
          index += op.length;
        } else if (TextOperation.isDelete(op)) {
          var from = cm.posFromIndex(index);
          var to   = cm.posFromIndex(index - op);
          cm.replaceRange('', from, to);
        }
      }
    });
  };

  CodeMirrorAdapter.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  CodeMirrorAdapter.prototype.onChange = function (_, changes) {
    if (!this.ignoreNextChange) {
      var pair = CodeMirrorAdapter.operationFromCodeMirrorChanges(changes, this.cm);
      this.trigger('change', pair[0], pair[1]);
    }
    this.ignoreNextChange = false;
  };

  CodeMirrorAdapter.prototype.onCursorActivity =
  CodeMirrorAdapter.prototype.onFocus = function () {
    this.trigger('cursorActivity');
  };

  CodeMirrorAdapter.prototype.onBlur = function () {
    if (!this.cm.somethingSelected()) { this.trigger('blur'); }
  };

  CodeMirrorAdapter.prototype.getValue = function () {
    return this.cm.getValue();
  };

  CodeMirrorAdapter.prototype.getCursor = function () {
    var cm = this.cm;
    var cursorPos = cm.getCursor();
    var position = cm.indexFromPos(cursorPos);

    var selectionList = cm.listSelections();
    var selection = [];
    for (var i = 0; i < selectionList.length; i++) {
      selection[i] = new Cursor.Range(
        cm.indexFromPos(selectionList[i].anchor),
        cm.indexFromPos(selectionList[i].head)
      );
    }

    return new Cursor(position, selection);
  };

  CodeMirrorAdapter.prototype.setCursor = function (cursor) {
    var position = this.cm.posFromIndex(cursor.position);
    if (cursor.selection.length === 0) {
      this.cm.setCursor(position);
    } else {
      var primary = null;
      var ranges = [];
      for (var i = 0; i < cursor.selection.length; i++) {
        var range = cursor.selection[i];
        if (range.head === position) { primary = i; }
        ranges[i] = { anchor: range.anchor, head: range.head };
      }
      this.cm.setSelections(ranges, primary);
    }
  };

  var addStyleRule = (function () {
    var added = {};
    var styleElement = document.createElement('style');
    document.documentElement.getElementsByTagName('head')[0].appendChild(styleElement);
    var styleSheet = styleElement.sheet;

    return function (css) {
      if (added[css]) { return; }
      added[css] = true;
      styleSheet.insertRule(css, (styleSheet.cssRules || styleSheet.rules).length);
    };
  }());

  CodeMirrorAdapter.prototype.setOtherCursor = function (cursor, color, clientId) {
    var cursorPos = this.cm.posFromIndex(cursor.position);
    if (cursor.selection.length === 0) {
      // show cursor
      var cursorCoords = this.cm.cursorCoords(cursorPos);
      var cursorEl = document.createElement('pre');
      cursorEl.className = 'other-client';
      cursorEl.style.borderLeftWidth = '2px';
      cursorEl.style.borderLeftStyle = 'solid';
      cursorEl.innerHTML = '&nbsp;';
      cursorEl.style.borderLeftColor = color;
      cursorEl.style.height = (cursorCoords.bottom - cursorCoords.top) * 0.9 + 'px';
      cursorEl.style.marginTop = (cursorCoords.top - cursorCoords.bottom) + 'px';
      cursorEl.style.zIndex = 0;
      cursorEl.setAttribute('data-clientid', clientId);
      this.cm.addWidget(cursorPos, cursorEl, false);
      return {
        clear: function () {
          var parent = cursorEl.parentNode;
          if (parent) { parent.removeChild(cursorEl); }
        }
      };
    } else {
      // show selection
      var match = /^#([0-9a-fA-F]{6})$/.exec(color);
      if (!match) { throw new Error("only six-digit hex colors are allowed."); }
      var selectionClassName = 'selection-' + match[1];
      var rule = '.' + selectionClassName + ' { background: ' + color + '; }';
      addStyleRule(rule);

      var selectionObjects = [];
      for (var i = 0; i < cursor.selection.length; i++) {
        var anchorPos = this.cm.posFromIndex(cursor.selection[i].anchor);
        var headPos   = this.cm.posFromIndex(cursor.selection[i].head);
        selectionObjects[i] = this.cm.markText(
          minPos(anchorPos, headPos),
          maxPos(anchorPos, headPos),
          { className: selectionClassName }
        );
      }

      return {
        clear: function () {
          for (var i = 0; i < selectionObjects.length; i++) {
            selectionObjects[i].clear();
          }
        }
      };
    }
  };

  CodeMirrorAdapter.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  CodeMirrorAdapter.prototype.applyOperation = function (operation) {
    this.ignoreNextChange = true;
    CodeMirrorAdapter.applyOperationToCodeMirror(operation, this.cm);
  };

  CodeMirrorAdapter.prototype.registerUndo = function (undoFn) {
    this.cm.undo = undoFn;
  };

  CodeMirrorAdapter.prototype.registerRedo = function (redoFn) {
    this.cm.redo = redoFn;
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  // Bind a method to an object, so it doesn't matter whether you call
  // object.method() directly or pass object.method as a reference to another
  // function.
  function bind (obj, method) {
    var fn = obj[method];
    obj[method] = function () {
      fn.apply(obj, arguments);
    };
  }

  return CodeMirrorAdapter;

}(this));
