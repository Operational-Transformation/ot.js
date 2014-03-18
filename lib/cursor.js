if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.Cursor = (function (global) {
  'use strict';

  var TextOperation = global.ot ? global.ot.TextOperation : require('./text-operation');

  // A cursor has a `position` and a `selection`. The property `position` is a
  // zero-based index into the document and `selection` an array of Range
  // objects (see below). When nothing is selected, the array is empty.
  function Cursor (position, selection) {
    this.position = position;

    var filteredSelection = [];
    for (var i = 0; i < selection.length; i++) {
      if (!selection[i].isEmpty()) { filteredSelection.push(selection[i]); }
    }
    this.selection = filteredSelection;
  }

  // Range has `anchor` and `head` properties, which are zero-based indices into
  // the document. The `anchor` is the side of the selection that stays fixed,
  // `head` is the side of the selection where the cursor is.
  function Range (anchor, head) {
    this.anchor = anchor;
    this.head = head;
  }

  Cursor.Range = Range;

  Range.fromJSON = function (obj) {
    return new Range(obj.anchor, obj.head);
  };

  Range.prototype.equals = function (other) {
    return this.anchor === other.anchor && this.head === other.head;
  };

  Range.prototype.isEmpty = function () {
    return this.anchor === this.head;
  };

  Cursor.fromJSON = function (obj) {
    var selection = [];
    for (var i = 0; i < obj.selection.length; i++) {
      selection[i] = Range.fromJSON(obj.selection[i]);
    }
    return new Cursor(obj.position, selection);
  };

  Cursor.prototype.equals = function (other) {
    if (this.position !== other.position) { return false; }
    if (this.selection.length !== other.selection.length) { return false; }
    // FIXME: Sort ranges before comparing them?
    for (var i = 0; i < this.selection.length; i++) {
      if (!this.selection[i].equals(other.selection[i])) { return false; }
    }
    return true;
  };

  // Return the more current cursor information.
  Cursor.prototype.compose = function (other) {
    return other;
  };

  // Update the cursor with respect to an operation.
  Cursor.prototype.transform = function (other) {
    function transformIndex (index) {
      var newIndex = index;
      var ops = other.ops;
      for (var i = 0, l = other.ops.length; i < l; i++) {
        if (TextOperation.isRetain(ops[i])) {
          index -= ops[i];
        } else if (TextOperation.isInsert(ops[i])) {
          newIndex += ops[i].length;
        } else {
          newIndex -= Math.min(index, -ops[i]);
          index += ops[i];
        }
        if (index < 0) { break; }
      }
      return newIndex;
    }

    var newPosition = transformIndex(this.position);

    var newSelection = [];
    for (var i = 0; i < this.selection.length; i++) {
      var range = this.selection[i];
      var newRange = new Range(transformIndex(range.anchor), transformIndex(range.head));
      if (!newRange.isEmpty()) { newSelection.push(newRange); }
    }

    return new Cursor(newPosition, newSelection);
  };

  return Cursor;

}(this));

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.Cursor;
}
