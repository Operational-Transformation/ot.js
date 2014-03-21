/*global module:false*/
module.exports = function (grunt) {

  // Project configuration.
  grunt.initConfig({
    banner: [
      '/*',
      ' *    /\\',
      ' *   /  \\ <%= pkg.name %> <%= pkg.version %>',
      ' *  /    \\ <%= pkg.homepage || \'\' %>',
      ' *  \\    /',
      ' *   \\  / (c) 2012-<%= grunt.template.today("yyyy") %> <%= pkg.author %>',
      ' *    \\/ <%= pkg.name %> may be freely distributed under the MIT license.',
      ' */\n\n'
    ].join('\n'),
    pkg: grunt.file.readJSON('package.json'),
    nodeunit: {
      files: ['test/lib/*.js']
    },
    connect: {
      port: 8000,
      base: '.'
    },
    qunit: {
      files: ['test/phantomjs/test.html']
    },
    concat: {
      options: {
        banner: '<%= banner %>'
      },
      dist: {
        src: [
          'lib/text-operation.js',
          'lib/selection.js',
          'lib/wrapped-operation.js',
          'lib/undo-manager.js',
          'lib/client.js',
          'lib/codemirror-adapter.js',
          'lib/socketio-adapter.js',
          'lib/ajax-adapter.js',
          'lib/editor-client.js'
        ],
        dest: 'dist/ot.js'
      }
    },
    uglify: {
      options: {
        banner: '<%= banner %>'
      },
      dist: {
        src: ['<%= concat.dist.dest %>'],
        dest: 'dist/ot-min.js'
      }
    },
    watch: {
      files: '<%= jshint.files %>',
      tasks: 'default'
    },
    jshint: {
      files: ['Gruntfile.js', 'lib/**/*.js', 'test/*.js', 'test/lib/*.js', 'test/phantomjs/test*.js'],
      options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: false,
        newcap: false, // there is a test that tests whether a constructor function can be called without new
        noarg: true,
        sub: true,
        undef: true,
        boss: true,
        eqnull: true,
        node: true,
        browser: true,
        strict: false
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-qunit');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-connect');

  // Default task.
  grunt.registerTask('default', ['jshint', 'nodeunit', 'concat', 'uglify', 'qunit']);

};
