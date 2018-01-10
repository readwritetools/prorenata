var expect = require('joezone').expect, terminal = require('joezone').terminal, Pfile = require('joezone').Pfile, Prorenata = require('./prorenata.class.js'), fs = require('fs');

module.exports = class CLI {
    constructor() {
        Object.seal(this);
    }
    validateOptions() {
        switch (2 == process.argv.length && this.usageAndExit(), process.argv[2]) {
          case '--version':
            return this.exit(this.showVersion()), !1;

          case '--syntax':
            return this.exit(this.listSyntax()), !1;

          case '--commands':
            return this.exit(this.listCommands()), !1;

          case '--parameters':
            return this.exit(this.listParameters()), !1;

          case '--examples':
            return this.exit(this.listExamples()), !1;

          case '--help':
            return this.exit(this.listHelp()), !1;

          default:
            return !0;
        }
    }
    usageAndExit() {
        var e = [];
        e.push('usage: prn [scriptfile] [options]'), e.push(''), e.push('options:'), e.push('    --version'), 
        e.push('    --syntax     explains the prorenata syntax'), e.push('    --commands   list the builtin commands'), 
        e.push('    --parameters list the builtin command parameters'), e.push('    --examples   show examples of p.r.n. scriptfiles'), 
        e.push('    --help       show prorenata syntax, commands, parameters'), this.exit(e.join('\n'));
    }
    showVersion() {
        try {
            var e = new Pfile(__dirname).addPath('../package.json').name, s = fs.readFileSync(e, 'utf-8'), t = JSON.parse(s);
            return `version v${t.version}`;
        } catch (e) {
            return `version unknown ${e.message}`;
        }
    }
    listSyntax() {
        var e = [];
        return e.push('Syntax: script files contain commands in this form:'), e.push(''), 
        e.push('command {'), e.push('   parameter value'), e.push('}'), e.join('\n');
    }
    listCommands() {
        var e = [];
        return e.push('commands := template | recurse | compare| copy | run'), e.push('   \'template\'  defines new commands for use with the <exec> parameter of \'recurse\''), 
        e.push('   \'recurse\'   runs a template-defined command recursively over all files in <source>'), 
        e.push('   \'compare\'   lists files that are in <source> but not in <dest>'), e.push('   \'copy\'      recursively copies all files in <source> to <dest>'), 
        e.push('   \'run\'       executes an arbitrary shell command'), e.join('\n');
    }
    listParameters() {
        var e = [];
        return e.push('\'recurse\'  parameters := source* | exec* | include | exclude | extension | overwrite | mkdir | progress | dest'), 
        e.push('\'compare\'  parameters := source* | dest* | include | exclude | extension'), 
        e.push('\'copy\'     parameters := source* | dest* | include | exclude | extension | overwrite | mkdir | progress'), 
        e.push('\'run\'      parameters := sh* | progress'), e.push('\'template\' has definitions (not parameters) for use with the <exec> parameter of a \'recurse\' command'), 
        e.push(''), e.push('parameters :='), e.push('   <source>    an absolute or relative path'), 
        e.push('   <dest>      an absolute or relative path'), e.push('   <include>   a file pattern to include, if omitted defaults to \'*\''), 
        e.push('   <exclude>   a file pattern to exclude'), e.push('   <extension> the filename extension to apply to destination filenames'), 
        e.push('   <exec>      a command name defined in the \'template\' section'), e.push('   <overwrite> := always | older | never†'), 
        e.push('   <mkdir>     := true | false†'), e.push('   <progress>  := verbose | regular† | none'), 
        e.push('   <sh>        a shell command to execute'), e.push(''), e.push('* required parameter'), 
        e.push('† optional parameter default value'), e.join('\n');
    }
    listExamples() {
        var e = [];
        return e.push('Sample using \'copy\' to recursively copy files with *.html extension from \'foo\' to \'bar\''), 
        e.push(''), e.push('copy {'), e.push('   source  foo'), e.push('   dest    bar'), 
        e.push('   include \'*.html\''), e.push('}'), e.push(''), e.push('Sample using \'template\' and \'recurse\' compile LESS into CSS from \'foo\' to \'bar\''), 
        e.push('template {'), e.push('   compile-css lessc <source> <dest>'), e.push('}'), 
        e.push('recurse {'), e.push('   source    foo'), e.push('   dest      bar'), e.push('   include   \'*.less\''), 
        e.push('   extension \'.css\''), e.push('   exec      compile-css'), e.push('}'), 
        e.push(''), e.push('Sample using \'template\' and user-defined command to count the number of files in \'foo\' with an \'html\' extension'), 
        e.push('template {'), e.push('   count-by-ext ls -l <path> | grep <ext> | wc -l'), 
        e.push('}'), e.push('count-by-ext {'), e.push('   path      foo'), e.push('   ext       html'), 
        e.push('}'), e.join('\n');
    }
    listHelp() {
        var e = [];
        return e.push(''), e.push('usage: prn [scriptfile] [options]'), e.push(''), e.push(this.listSyntax()), 
        e.push(''), e.push(this.listCommands()), e.push(''), e.push(this.listParameters()), 
        e.push(''), e.push(this.listExamples()), e.join('\n');
    }
    exit(e) {
        terminal.writeToConsoleOrStderr('\nProrenata recursively operates on paths running commands only when necessary\n'), 
        terminal.writeToConsoleOrStderr(e + '\n'), process.exit(0);
    }
    execute() {
        var e = new Prorenata();
        e.execute();
    }
};