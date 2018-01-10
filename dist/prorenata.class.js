var expect = require('joezone').expect, Pfile = require('joezone').Pfile, Bunch = require('joezone').Bunch, terminal = require('joezone').terminal, FileInterface = require('bluephrase').FileInterface, RootEntity = require('bluephrase').RootEntity, EntityPath = require('bluephrase').EntityPath, TT = require('bluephrase').TT, fs = require('fs'), ChildProcess = require('child_process');

terminal.setProcessName('[prn]');

var gray = terminal.gray, red = terminal.red, green = terminal.green, yellow = terminal.yellow, blue = terminal.blue;

module.exports = class Prorenata {
    constructor() {
        this.instructionPfile = null, this.root = null, this.commands = new Map(), this.privateJoinChar = '|', 
        this.halt = !1, this.setup(), Object.seal(this);
    }
    setup() {
        this.commands.set('template', 'builtin'), this.commands.set('copy', 'builtin'), 
        this.commands.set('recurse', 'builtin'), this.commands.set('compare', 'builtin'), 
        this.commands.set('run', 'builtin');
    }
    execute() {
        if (process.argv.length <= 2) return process.stdout.write('usage: prn scriptfile\n'), 
        process.stdout.write('       prn --version\n'), void process.stdout.write('       prn --help\n');
        if ('--version' != process.argv[2]) if ('--help' != process.argv[2]) this.instructionPfile = new Pfile(process.argv[2]), 
        this.instructionPfile.makeAbsolute(), this.instructionPfile.exists() ? (this.readInstructions(), 
        this.processInstructions()) : process.stdout.write(green(this.instructionPfile.name), ' not found\n'); else {
            var e = new Array();
            e.push(''), e.push('Script files contain commands in this form:'), e.push(''), e.push('command {'), 
            e.push('   parameter value'), e.push('}'), e.push(''), e.push('commands := template | copy | recurse | compare | run'), 
            e.push('   \'template\'  defines new commands for use with the <exec> parameter of \'recurse\''), 
            e.push('   \'copy\'      recursively copies all files in <source> to <dest>'), e.push('   \'recurse\'   runs a template-defined command recursively over all files in <source>'), 
            e.push('   \'compare\'   lists files that are in <source> but not in <dest>'), e.push('   \'run\'       executes an arbitrary shell command'), 
            e.push(''), e.push('parameters := source | dest | include | exclude | extension | exec | overwrite | mkdir | progress'), 
            e.push('   <source>    an absolute or relative path'), e.push('   <dest>      an absolute or relative path'), 
            e.push('   <include>   a file pattern to include, if omitted defaults to \'*\''), 
            e.push('   <exclude>   a file pattern to exclude'), e.push('   <extension> the filename extension to apply to destination filenames'), 
            e.push('   <exec>      a command name defined in the \'template\' section'), e.push('   <overwrite> := always | older | never'), 
            e.push('   <mkdir>     := true | false'), e.push('   <progress>  := verbose | regular | none'), 
            e.push('   <sh>        a shell command to execute; used with the \'run\' command'), 
            e.push(''), e.push('Sample script to copy *.html from \'foo\' to \'bar\''), e.push(''), 
            e.push('copy {'), e.push('   source  foo'), e.push('   dest    bar'), e.push('   include \'*.html\''), 
            e.push('}'), e.push(''), e.push('Sample script to recursively compile LESS into CSS from \'foo\' to \'bar\''), 
            e.push('template {'), e.push('   LESS lessc <source> <dest>'), e.push('}'), e.push('recurse {'), 
            e.push('   source    foo'), e.push('   dest      bar'), e.push('   include   \'*.less\''), 
            e.push('   extension \'.css\''), e.push('   exec      LESS'), e.push('}'), e.push(''), 
            e.push('');
            var r = e.join('\n');
            process.stdout.write(r);
        } else process.stdout.write('prorenata version 1.0\n');
    }
    readInstructions() {
        expect(this.instructionPfile, 'Pfile');
        try {
            var e = new FileInterface();
            e.setOption('vocabulary', 'unchecked'), this.root = e.readFile(this.instructionPfile.name);
        } catch (e) {
            log.abnormal(e);
        }
    }
    processInstructions() {
        for (let t = 0; t < this.root.children.length; t++) {
            if (1 == this.halt) return;
            var e = this.root.children[t], r = e.entityType;
            if ('GroupEntity' == r || 'StandardEntity' == r) this.processCommand(e); else if ('GraynoteEntity' == r) e.tokenType == TT.GRAYNOTE_COMMENT && terminal.trace(gray(e.value.trim())); else {
                if ('PragmaEntity' == r) continue;
                terminal.logic('Unhandled entityType ', blue(e.entityType));
            }
        }
    }
    processCommand(e) {
        expect(e, [ 'GroupEntity', 'StandardEntity' ]);
        var r = e.name;
        if (this.commands.has(r)) {
            var t = this.commands.get(r);
            'builtin' == t ? this.processBuiltinCommand(r, e) : this.processUserDefinedCommand(r, t, e);
        } else terminal.warning('The command ', blue(r), ' has not been defined');
    }
    processBuiltinCommand(e, r) {
        switch (expect(e, 'String'), expect(r, 'GroupEntity'), e) {
          case 'template':
            this.processTemplateCommand(r);
            break;

          case 'copy':
            this.processCopyCommand(r);
            break;

          case 'recurse':
            this.processRecurseCommand(r);
            break;

          case 'compare':
            this.processCompareCommand(r);
            break;

          case 'run':
            this.processRunCommand(r);
            break;

          default:
            terminal.logic('Unhandled builtin command ', blue(e));
        }
    }
    processUserDefinedCommand(e, r, t) {
        expect(e, 'String'), expect(r, 'String'), expect(t, [ 'GroupEntity', 'StandardEntity' ]);
        var i = this.buildParameterMap(e, t);
        this.verifyUserParams(e, i);
        var s = r.split(' '), n = this.replaceParamsWithValues(s, i), a = i.get('source'), l = i.get('dest'), o = this.formatProgressMsg(e, a, l, n, 'shortForm');
        this.executeChildProcess(e, n, o, i);
    }
    processTemplateCommand(e) {
        expect(e, 'GroupEntity');
        for (let n = 0; n < e.children.length; n++) {
            var r = e.children[n], t = r.entityType;
            if ('StandardEntity' == t) {
                var i = r.name, s = r.innerText;
                this.commands.set(i, s);
            } else {
                if ('PragmaEntity' == t || 'GraynoteEntity' == t) continue;
                terminal.logic('Unhandled entity type ', green(t), ' in processTemplateCommand');
            }
        }
    }
    processCopyCommand(e) {
        expect(e, 'GroupEntity');
        var r = this.buildParameterMap('copy', e);
        this.verifyBuiltinParams('copy', r);
        var t = [ 'cp', '--preserve', '<source>', '<dest>' ];
        this.beginRecursion('copy', t, r);
    }
    processRecurseCommand(e) {
        expect(e, 'GroupEntity');
        var r = this.buildParameterMap('recurse', e);
        this.verifyBuiltinParams('recurse', r);
        var t = r.get('exec').trim();
        if (this.commands.has(t)) {
            var i = this.commands.get(t);
            expect(i, 'String');
            var s = i.split(' ');
            this.beginRecursion(t, s, r);
        } else terminal.warning(blue('recurse '), green('<exec>'), ' specifies an undefined command ', red(t));
    }
    processCompareCommand(e) {
        expect(e, 'GroupEntity');
        var r = this.buildParameterMap('compare', e);
        this.verifyBuiltinParams('compare', r);
        var t = [];
        this.beginRecursion('compare', t, r);
    }
    processRunCommand(e) {
        expect(e, 'GroupEntity');
        var r = this.buildParameterMap('run', e);
        this.verifyBuiltinParams('run', r);
        for (let o = 0; o < e.children.length; o++) {
            var t = e.children[o], i = t.entityType;
            if (1 == this.halt) return;
            if ('StandardEntity' == i) {
                var s = t.name, n = t.innerText;
                if ('progress' == s) return;
                if ('sh' != s) return void terminal.invalid(blue('run'), ' items within this command should be preceeded by ', green('sh'), ' ignoring ', red(s), ' ', red(n));
                var a = n.split(' '), l = this.formatProgressMsg('run', null, null, a, 'argsForm');
                this.executeChildProcess('run', a, l, r);
            } else {
                if ('PragmaEntity' == i || 'GraynoteEntity' == i) continue;
                terminal.logic('Unhandled entity type ', green(i), ' in processRunCommand');
            }
        }
    }
    beginRecursion(e, r, t) {
        expect(e, 'String'), expect(r, 'Array'), expect(t, 'Map'), expect(this.instructionPfile, 'Pfile');
        var i = this.instructionPfile.getPath();
        if (t.has('source')) {
            var s = new Pfile(t.get('source'));
            if (s.isAbsolutePath() || (s = new Pfile(i).addPath(t.get('source'))), t.has('dest')) {
                (n = new Pfile(t.get('dest'))).isAbsolutePath() || (n = new Pfile(i).addPath(t.get('dest')));
            } else var n = null;
            var a = new Array();
            t.has('include') && (a = t.get('include').split(this.privateJoinChar), expect(a, 'Array'));
            var l = new Array();
            t.has('exclude') && (l = t.get('exclude').split(this.privateJoinChar), expect(l, 'Array'));
            var o = 'never';
            t.has('overwrite') && 'always' != (o = t.get('overwrite')) && 'older' != o && 'never' != o && (o = 'never');
            var u = 'compare' == e ? 'false' : 'true';
            t.has('mkdir') && 'true' != (u = t.get('mkdir')) && 'false' != u && (u = 'false'), 
            t.delete('exec'), t.delete('include'), t.delete('exclude'), t.delete('overwrite'), 
            t.delete('mkdir');
            this.recurseFileSystem(s, n, e, r, t, a, l, o, u, 0);
        } else terminal.abnormal(blue(e), ' no ', red('<source>'), ' parameter provided, can not continue');
    }
    recurseFileSystem(e, r, t, i, s, n, a, l, o, u) {
        if (expect(e, 'Pfile'), expect(r, [ 'Pfile', 'null' ]), expect(t, 'String'), expect(i, 'Array'), 
        expect(s, 'Map'), expect(n, 'Array'), expect(a, 'Array'), expect(l, 'String'), expect(o, 'String'), 
        expect(u, 'Number'), 1 != this.halt) if (u > 10) terminal.abnormal(blue(t), ' halting recursion at ', green(r.name), ' which is 10 subdirectories deep'); else if (e.isDirectory()) {
            if (this.isExcluded(e, t, a, s)) return;
            if (null != r) {
                var c = r.name.indexOf(e.name);
                if (0 == c) {
                    var p = e.name.length, m = r.name.charAt(p);
                    if ('/' == m) return void terminal.invalid(blue(t), ' source path ', green(e.name), ' and destination path ', green(r.name), ' overlap. Halting to prevent infinite loop.');
                }
                if ('true' == o && r.mkDir(), !r.exists()) return void ('compare' == t ? terminal.trace(blue(t), ' ', green(this.shortDisplayFilename(r.name)), ' does not exist in dest') : terminal.invalid(blue(t), ' destination path ', green(this.shortDisplayFilename(r.name)), ' does not exist, and ', green('mkdir'), ' is ', green('false')));
            }
            var h = new Bunch(e.name, '*', Bunch.FILE + Bunch.DIRECTORY), d = h.find(!1);
            for (let c = 0; c < d.length; c++) {
                var g = d[c], f = new Pfile(e).addPath(g), v = null == r ? null : new Pfile(r).addPath(g);
                this.recurseFileSystem(f, v, t, i, s, n, a, l, o, u + 1);
            }
        } else if (e.isFile()) {
            if (!this.isIncluded(e, t, n, s)) return;
            if (this.isExcluded(e, t, a, s)) return;
            if (null != r) {
                if (s.has('extension')) {
                    var y = s.get('extension');
                    '.' == y.charAt(0) && (y = y.substr(1)), r.replaceExtension(y);
                }
                if ('compare' == t) return void (r.exists() || terminal.trace(blue(t), ' ', green(this.shortDisplayFilename(e.name)), ' is in source, but ', green(this.shortDisplayFilename(r.name)), ' is not in dest'));
                var b = this.allowOverwrite(e, r, l);
                if (b < 0) return void (-230 == b ? this.verboseTrace(blue(t) + ' not overwriting because ' + green(this.shortDisplayFilename(e.name)) + blue(' same as ') + green(this.shortDisplayFilename(r.name)), s) : -240 == b ? this.verboseTrace(blue(t) + ' not overwriting because ' + green(this.shortDisplayFilename(e.name)) + blue(' older than ') + green(this.shortDisplayFilename(r.name)), s) : -300 == b ? this.verboseTrace(blue(t) + ' not overwriting because ' + green(this.shortDisplayFilename(r.name)) + blue(' already exists'), s) : terminal.logic(`allowOverwrite = ${b}`));
            }
            s.set('source', e.name), s.set('dest', null == r ? null : r.name);
            var x = this.replaceParamsWithValues(i, s), w = this.formatProgressMsg(t, e, r, x, 'shortForm');
            this.executeChildProcess(t, x, w, s);
        } else terminal.warning(blue(t), ' ', e.name, red(' NOT FOUND'));
    }
    regularTrace(e, r) {
        if (expect(e, 'String'), expect(r, 'Map'), r.has('progress')) var t = r.get('progress'); else t = 'regular';
        'regular' != t && 'verbose' != t || terminal.trace(e);
    }
    verboseTrace(e, r) {
        if (expect(e, 'String'), expect(r, 'Map'), r.has('progress')) var t = r.get('progress'); else t = 'regular';
        'verbose' == t && terminal.trace(e);
    }
    executeChildProcess(e, r, t, i) {
        expect(e, 'String'), expect(r, 'Array'), expect(t, 'String'), expect(i, 'Map');
        var s = r[0], n = (new Pfile(s), r.slice(1)), a = {
            cwd: this.instructionPfile.getPath(),
            stdio: [ 0, 1, 2 ]
        };
        try {
            this.regularTrace(t, i);
            var l = ChildProcess.spawnSync(s, n, a);
            0 != l.status && (terminal.warning(blue(e), ' halting further steps because last step returned ', red(`${l.status}`)), 
            this.halt = !0);
        } catch (r) {
            if (-1 != r.message.indexOf('spawnSync') && -1 != r.message.indexOf('ENOENT')) terminal.abnormal(blue(e), ' executable file not found ', blue(s)); else {
                var o = r.message.replace('spawnSync', 'Couldn\'t start').replace('ENOENT', '(No such file or directory)');
                terminal.abnormal(blue(e), o);
            }
        }
    }
    formatProgressMsg(e, r, t, i, s) {
        if (expect(e, 'String'), expect(r, [ 'Pfile', 'null' ]), expect(t, [ 'Pfile', 'null' ]), 
        expect(i, 'Array'), expect(s, 'String'), 'shortForm' == s) {
            if (null == t) {
                var n = this.shortDisplayFilename(r.name);
                return blue(e) + ' ' + green(n);
            }
            n = this.shortDisplayFilename(r.name);
            var a = this.shortDisplayFilename(t.name);
            return blue(e) + ' ' + green(n) + ' --\x3e ' + green(a);
        }
        if ('argsForm' == s) {
            var l = '';
            for (let e = 0; e < i.length; e++) l += ' ' + i[e];
            return blue(e) + green(l);
        }
        return terminal.logic('formatProgressMsg'), '';
    }
    shortDisplayFilename(e) {
        var r = this.instructionPfile.getPath();
        if (0 == e.indexOf(r)) return e.substr(r.length + 1);
        for (;-1 != r.indexOf('/'); ) {
            var t = r.split('/');
            if (t.pop(), r = t.join('/'), 0 == e.indexOf(r)) {
                var i = e.substr(r.length);
                return '/' == i.charAt(0) ? i.substr(1) : i;
            }
        }
        return e;
    }
    isIncluded(e, r, t, i) {
        if (expect(e, 'Pfile'), expect(r, 'String'), expect(t, 'Array'), 0 == t.length) return !0;
        var s = e.name;
        for (let e = 0; e < t.length; e++) {
            var n = t[e].replace('\\', '\\\\').replace('^', '\\^').replace('$', '\\$').replace('.', '\\.').replace('+', '\\+').replace('(', '\\(').replace(')', '\\)').replace('?', '.?').replace('*', '.*'), a = new RegExp(n + '$');
            if (a.test(s)) return !0;
        }
        var l = t.join(', ');
        return this.verboseTrace(blue(r) + ' not including ' + green(this.shortDisplayFilename(s)) + ' because it does not match ' + blue(l), i), 
        !1;
    }
    isExcluded(e, r, t, i) {
        expect(e, 'Pfile'), expect(r, 'String'), expect(t, 'Array');
        var s = e.name;
        for (let e = 0; e < t.length; e++) {
            var n = t[e].replace('\\', '\\\\').replace('^', '\\^').replace('$', '\\$').replace('.', '\\.').replace('+', '\\+').replace('(', '\\(').replace(')', '\\)').replace('?', '.?').replace('*', '.*'), a = new RegExp(n + '$');
            if (a.test(s)) return this.verboseTrace(blue(r) + ' excluding ' + green(this.shortDisplayFilename(s)) + ' by request ' + blue(t[e]), i), 
            !0;
        }
        return !1;
    }
    allowOverwrite(e, r, t) {
        if (expect(e, 'Pfile'), expect(r, 'Pfile'), expect(t, 'String'), 'always' == t) return 100;
        if ('older' == t) {
            if (r.exists()) {
                var i = fs.statSync(r.name).mtime.getTime(), s = fs.statSync(e.name).mtime.getTime();
                return s > i ? 220 : s == i ? -230 : s < i ? -240 : (terminal.logic('allowOverwrite'), 
                -250);
            }
            return 210;
        }
        return 'never' == t ? r.exists() ? -300 : 300 : (terminal.logic('Unhandled overwriteRule ', red(t)), 
        -400);
    }
    buildParameterMap(e, r) {
        expect(e, 'String'), expect(r, [ 'GroupEntity', 'StandardEntity' ]);
        var t = new Map();
        if ('StandardEntity' == r.constructor.name) return t;
        for (let p = 0; p < r.children.length; p++) {
            var i = r.children[p], s = i.entityType;
            if ('PragmaEntity' != s && 'GraynoteEntity' != s) {
                if (i.attributes.size > 0) {
                    var n = Array.from(i.attributes.entries());
                    for (let r = 0; r < n.length; r++) {
                        var a = n[r][0], l = n[r][1];
                        if ('class' == a) terminal.warning(blue(e), ' parameter values beginning with FULL-STOP must be quoted ', red(l)); else if ('id' == a) terminal.warning(blue(e), ' parameter values beginning with HASHTAG must be quoted #', red(l)); else if ('style' == a) terminal.warning(blue(e), ' parameter values beginning with CIRCUMFLEX must be quoted ^', red(l)); else if ('role' == a) terminal.warning(blue(e), ' parameter values beginning with PLUS-SIGN must be quoted +', red(l)); else if ('property' == a) terminal.warning(blue(e), ' parameter values beginning with QUESTION-MARK must be quoted ?', red(l)); else if ('data-junctor' == a) terminal.warning(blue(e), ' parameter values beginning with TILDE must be quoted ~', red(l)); else if ('sourceref' == a || 'href' == a || 'src' == a || 'data' == a || 'action' == a || 'cite' == a) {
                            terminal.warning(blue(e), ' parameter values beginning with GRAVE-ACCENT must be quoted ', red(`\`${l}\``));
                        } else null == l && (l = a), terminal.warning(blue(e), ' parameter values beginning with ASTERISK must be quoted *', red(l));
                    }
                }
                if ('StandardEntity' == s) {
                    var o = i.name, u = this.removeQuotedDelimiters(i.innerText);
                    if ('include' == o) {
                        var c = t.has('include') ? t.get('include') + this.privateJoinChar + u : u;
                        t.set(o, c);
                    } else if ('exclude' == o) {
                        c = t.has('exclude') ? t.get('exclude') + this.privateJoinChar + u : u;
                        t.set(o, c);
                    } else 'overwrite' == o ? ('older' != u && 'always' != u && 'never' != u && terminal.warning(blue(e), ' the <overwrite> parameter is ', red(u), ' only ', blue('always | older | never'), ' are meaningful'), 
                    t.set(o, u)) : t.set(o, u);
                } else terminal.logic('Unhandled entity type ', green(s), ' in buildParameterMap');
            }
        }
        return t;
    }
    verifyUserParams(e, r) {
        expect(e, 'String'), expect(r, 'Map');
        var t = this.commands.get(e);
        expect(t, 'String');
        for (let [s, n] of r.entries()) {
            var i = `<${s}>`;
            -1 == t.indexOf(i) && terminal.warning(blue(e), ' does not use the parameter ', red(`<${s}>`), ' ignorning ', red(n));
        }
        var s = t.match(/(\<.*?\>)/g);
        if (null != s) for (let t = 0; t < s.length; t++) {
            var n = s[t].substr(1, s[t].length - 2);
            r.has(n) || terminal.warning(blue(e), ' expects a parameter named ', red(`<${n}>`));
        }
    }
    verifyBuiltinParams(e, r) {
        if (expect(e, 'String'), expect(r, 'Map'), 'copy' == e) var t = [ 'source', 'dest' ], i = [ 'include', 'exclude', 'overwrite', 'mkdir', 'extension', 'progress' ]; else if ('recurse' == e) t = [ 'source', 'exec' ], 
        i = [ 'dest', 'include', 'exclude', 'overwrite', 'mkdir', 'extension', 'progress' ]; else if ('compare' == e) t = [ 'source', 'dest' ], 
        i = [ 'include', 'exclude', 'extension' ]; else if ('run' == e) t = [ 'sh' ], i = [ 'progress' ]; else terminal.logic('verifyBuiltinParams');
        for (let [s, n] of r.entries()) t.includes(s) || i.includes(s) || terminal.warning(blue(e), ' does not use the parameter ', red(`<${s}>`), ', ignorning ', red(n));
        for (let i = 0; i < t.length; i++) r.has(t[i]) || terminal.warning(blue(e), ' expects a parameter named ', red(`<${t[i]}>`));
    }
    replaceParamsWithValues(e, r) {
        expect(e, 'Array'), expect(r, 'Map');
        var t = new Array();
        t.push(e[0]);
        for (let a = 1; a < e.length; a++) {
            var i = e[a];
            if ('<' == i.charAt(0) && '>' == i.charAt(i.length - 1)) {
                var s = i.substr(1, i.length - 2);
                if (r.has(s)) {
                    var n = r.get(s);
                    t.push(n);
                    continue;
                }
            }
            t.push(e[a]);
        }
        return t;
    }
    removeQuotedDelimiters(e) {
        var r = (e = e.trim()).charAt(0), t = e.charAt(e.length - 1);
        return r != t || '\'' != r && '"' != r ? e : e.substr(1, e.length - 2);
    }
};