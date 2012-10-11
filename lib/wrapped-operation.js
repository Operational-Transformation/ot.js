if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.WrappedOperation = (function (global) {

  // A WrappedOperation contains an operation and corresponing metadata.
  function WrappedOperation (operation, meta) {
    this.wrapped = operation;
    this.meta    = meta || {};
  }

  WrappedOperation.prototype.apply = function () {
    return this.wrapped.apply.apply(this.wrapped, arguments);
  };

  WrappedOperation.prototype.invert = function () {
    var inverted = this.wrapped.invert.apply(this.wrapped, arguments);
    return new WrappedOperation(inverted, this.meta);
  };

  // Copy all properties from source to target.
  function copy (source, target) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
  }

  WrappedOperation.prototype.compose = function (other) {
    var meta = {};
    copy(this.meta, meta);
    copy(other.meta, meta);
    return new WrappedOperation(this.wrapped.compose(other.wrapped), meta);
  };

  WrappedOperation.transform = function (a, b) {
    var transform = a.wrapped.constructor.transform;
    var pair = transform(a.wrapped, b.wrapped);
    return [
      new WrappedOperation(pair[0], a.meta),
      new WrappedOperation(pair[1], b.meta)
    ];
  };

  return WrappedOperation;

}(this));

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.WrappedOperation;
}