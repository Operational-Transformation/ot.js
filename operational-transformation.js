var operational_transformation = (function () {

  function Operation (ops) {
    this.ops = ops || [];
  }

  Operation.prototype.skip = function (n) {
    assert(n > 0);
    this.ops.push({ skip: n });
  };

  Operation.prototype.insert = function (str) {
    assert(str);
    this.ops.push({ insert: str });
  };

  Operation.prototype.delete = function (str) {
    assert(str);
    this.ops.push({ delete: str });
  };

  function apply (str, operation) {
    var newStr = [], j = 0;
    var strIndex = 0;
    var ops = operation.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.skip) {
        if (strIndex + op.skip > str.length) {
          throw new Error("Operation can't retain more characters than are left in the string.");
        }
        newStr[j++] = str.slice(strIndex, strIndex + op.skip);
        strIndex += op.skip;
      } else if (op.insert) {
        newStr[j++] = op.insert;
      } else { // delete op
        if (op.delete !== str.slice(strIndex, strIndex + op.delete.length)) {
          throw new Error("The deleted string and the next characters in the string don't match.");
        }
        strIndex += op.delete.length;
      }
    }
    if (strIndex !== str.length) {
      throw new Error("The operation didn't ");
    }
    return newStr.join('');
  }

  function compose (operation1, operation2) {
    return null;
  }

  function transform (operation1, operation2) {
    return null;
  }

  function assert (b) {
    if (!b) {
      throw new Error("Assertion error");
    }
  }

  return {
    Operation: Operation,
    apply: apply,
    compose: compose,
    transform: transform
  };

})();

if (typeof module === 'object') {
  module.exports = operational_transformation;
}