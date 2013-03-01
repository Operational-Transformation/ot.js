if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.Cursor = (function (global) {
  'use strict';

  var TextOperation = global.ot ? global.ot.TextOperation : require('./text-operation');

  // A cursor has a `position` and a `selectionEnd`. Both are zero-based indexes
  // into the document. When nothing is selected, `selectionEnd` is equal to
  // `position`. When there is a selection, `position` is always the side of the
  // selection that would move if you pressed an arrow key.
  function Cursor (position, selectionEnd) {
    this.position = position;
    this.selectionEnd = selectionEnd;
  }

  Cursor.fromJSON = function (obj) {
    return new Cursor(obj.position, obj.selectionEnd);
  };

  Cursor.prototype.equals = function (other) {
    return this.position === other.position &&
      this.selectionEnd === other.selectionEnd;
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
    if (this.position === this.selectionEnd) {
      return new Cursor(newPosition, newPosition);
    }
    return new Cursor(newPosition, transformIndex(this.selectionEnd));
  };

  return Cursor;

}(this));

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.Cursor;
}
