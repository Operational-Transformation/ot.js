/*global ot */

ot.CodeMirrorAdapter = (function () {
  'use strict';

  var TextOperation = ot.TextOperation;
  var Cursor = ot.Cursor;

  function CodeMirrorAdapter (cm) {
    this.cm = cm;
    this.ignoreNextChange = false;
    this.changeRanges = [];
    this.docLength = this.cm.indexFromPos({ line: this.cm.lastLine(), ch: 0 }) +
      this.cm.getLine(this.cm.lastLine()).length;
    this.oldValue = this.cm.getValue();

    bind(this, 'onBeforeChange');
    bind(this, 'onChange');
    bind(this, 'onCursorActivity');
    bind(this, 'onFocus');
    bind(this, 'onBlur');
    cm.on('beforeChange', this.onBeforeChange);
    cm.on('change', this.onChange);
    cm.on('cursorActivity', this.onCursorActivity);
    cm.on('focus', this.onFocus);
    cm.on('blur', this.onBlur);
  }

  // Removes all event listeners from the CodeMirror instance.
  CodeMirrorAdapter.prototype.detach = function () {
    this.cm.off('beforeChange', this.onBeforeChange);
    this.cm.off('change', this.onChange);
    this.cm.off('cursorActivity', this.onCursorActivity);
    this.cm.off('focus', this.onFocus);
    this.cm.off('blur', this.onBlur);
  };

  function eqPos (a, b) { return a.line === b.line && a.ch === b.ch; }

  // Converts a CodeMirror change object into a TextOperation and its inverse
  // and returns them as a two-element array. Apart from the CodeMirror change
  // object, it requires several other pieces of information:
  //
  // * `doc`: the CodeMirror document (a standalone document or simply the CodeMirror
  //   instance)
  // * `docStartLength`: the length of the document in characters before the change.
  // * `changeRanges`: an array of `{ from, to, fromIndex, replacedText }` objects that contain
  //   the same from and to position objects in the same order as the linked
  //   list in the change object. `fromIndex` is the zero-based position in
  //   the pre-change document corresponding to `from`. `replacedText` contains
  //   the text that got deleted by the change.
  CodeMirrorAdapter.operationFromCodeMirrorChange = function (change, doc, docStartLength, changeRanges) {
    var docLength = docStartLength;
    var operation = new TextOperation().retain(docLength);
    var inverse   = new TextOperation().retain(docLength);

    var i = 0;
    while (change) {
      var changeRange = changeRanges[i];
      if (!changeRange || !eqPos(changeRange.from, change.from) || !eqPos(changeRange.to, change.to)) {
        throw new Error("Not enough information in 'changeRanges' array.");
      }
      var text = change.text.join('\n');
      var replacedText = changeRange.replacedText;
      var restLength = docLength - changeRange.fromIndex - replacedText.length;

      operation = operation.compose(new TextOperation()
        .retain(changeRange.fromIndex)
        ['delete'](replacedText.length)
        .insert(text)
        .retain(restLength)
      );

      inverse = new TextOperation()
        .retain(changeRange.fromIndex)
        ['delete'](text.length)
        .insert(replacedText)
        .retain(restLength)
        .compose(inverse);

      docLength += -replacedText.length + text.length;

      change = change.next;
      i++;
    }

    return [operation, inverse];
  };

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

  // Returns a `changeRange` object (as described in the documentation for the
  // `operationFromCodeMirrorChange` method) from a change object returned by
  // the `'beforeChange'` event. Must be called directly from the event handler.
  // Note that the objects obtained from the `beforeChange` events are only in
  // one-to-one correspondents with the elements of the linked list of change
  // objects if the document doesn't contain read-only ranges!
  CodeMirrorAdapter.getChangeRange = function (doc, change) {
    return {
      from: change.from,
      fromIndex: doc.indexFromPos(change.from),
      to: change.to,
      replacedText: doc.getRange(change.from, change.to)
    };
  };

  CodeMirrorAdapter.prototype.onBeforeChange = function (_, change) {
    this.changeRanges.push(CodeMirrorAdapter.getChangeRange(this.cm, change));
  };

  CodeMirrorAdapter.prototype.onChange = function (_, change) {
    if (!this.ignoreNextChange) {
      var pair = CodeMirrorAdapter.operationFromCodeMirrorChange(
        change, this.cm,
        this.docLength, this.changeRanges
      );
      this.trigger('change', pair[0], pair[1]);
    }
    this.ignoreNextChange = false;
    this.changeRanges = [];
    this.docLength = this.cm.indexFromPos({ line: this.cm.lastLine(), ch: 0 }) +
      this.cm.getLine(this.cm.lastLine()).length;
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
    var selectionEnd;
    if (cm.somethingSelected()) {
      var startPos = cm.getCursor(true);
      var selectionEndPos = eqPos(cursorPos, startPos) ? cm.getCursor(false) : startPos;
      selectionEnd = cm.indexFromPos(selectionEndPos);
    } else {
      selectionEnd = position;
    }

    return new Cursor(position, selectionEnd);
  };

  CodeMirrorAdapter.prototype.setCursor = function (cursor) {
    this.cm.setSelection(
      this.cm.posFromIndex(cursor.position),
      this.cm.posFromIndex(cursor.selectionEnd)
    );
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
    if (cursor.position === cursor.selectionEnd) {
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

      var fromPos, toPos;
      if (cursor.selectionEnd > cursor.position) {
        fromPos = cursorPos;
        toPos = this.cm.posFromIndex(cursor.selectionEnd);
      } else {
        fromPos = this.cm.posFromIndex(cursor.selectionEnd);
        toPos = cursorPos;
      }
      return this.cm.markText(fromPos, toPos, {
        className: selectionClassName
      });
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

}());
