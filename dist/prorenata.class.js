var expect = require('joezone').expect, Pfile = require('joezone').Pfile, Bunch = require('joezone').Bunch, terminal = require('joezone').terminal, FileInterface = require('bluephrase').FileInterface, RootEntity = require('bluephrase').RootEntity, EntityPath = require('bluephrase').EntityPath, TT = require('bluephrase').TT, fs = require('fs'), ChildProcess = require('child_process');

terminal.setProcessName('[prn]');

var gray = terminal.gray, red = terminal.red, green = terminal.green, yellow = terminal.yellow, blue = terminal.blue;

module.exports = class Prorenata {
    constructor() {
        this.instructionPfile = null, this.root = null, this.commands = new Map(), this.privateJoinChar = '|', 
        this.halt = !1, this.compareMiscount = 0, this.setup(), Object.seal(this);
    }
    setup() {
        this.commands.set('template', 'builtin'), this.commands.set('copy', 'builtin'), 
        this.commands.set('recurse', 'builtin'), this.commands.set('compare', 'builtin'), 
        this.commands.set('run', 'builtin');
    }
    execute() {
        process.argv.length <= 2 || (this.instructionPfile = new Pfile(process.argv[2]), 
        this.instructionPfile.makeAbsolute(), this.instructionPfile.exists() ? (this.readInstructions(), 
        this.processInstructions()) : terminal.writeToConsoleOrStderr(green(this.instructionPfile.name) + ' not found'));
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
        var n = r.split(' '), a = this.replaceParamsWithValues(n, i), s = (i.get('source'), 
        i.get('dest'), this.formatProgressMsg(e, null, null, a, 'argsForm'));
        this.executeChildProcess(e, a, s, i);
    }
    processTemplateCommand(e) {
        expect(e, 'GroupEntity');
        for (let a = 0; a < e.children.length; a++) {
            var r = e.children[a], t = r.entityType;
            if ('StandardEntity' == t) {
                var i = r.name, n = r.innerText;
                this.commands.set(i, n);
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
            var n = i.split(' ');
            this.beginRecursion(t, n, r);
        } else terminal.warning(blue('recurse '), green('<exec>'), ' specifies an undefined command ', red(t));
    }
    processCompareCommand(e) {
        expect(e, 'GroupEntity');
        var r = this.buildParameterMap('compare', e);
        this.verifyBuiltinParams('compare', r), this.compareMiscount = 0;
        var t = [];
        this.beginRecursion('compare', t, r), this.compareMiscount > 0 && this.halt;
    }
    processRunCommand(e) {
        expect(e, 'GroupEntity');
        var r = this.buildParameterMap('run', e);
        this.verifyBuiltinParams('run', r);
        for (let o = 0; o < e.children.length; o++) {
            var t = e.children[o], i = t.entityType;
            if (1 == this.halt) return;
            if ('StandardEntity' == i) {
                var n = t.name, a = t.innerText;
                if ('progress' == n) return;
                if ('sh' != n) return void terminal.invalid(blue('run'), ' items within this command should be preceeded by ', green('sh'), ' ignoring ', red(n), ' ', red(a));
                var s = a.split(' '), l = this.formatProgressMsg('run', null, null, s, 'argsForm');
                this.executeChildProcess('run', s, l, r);
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
            var n = new Pfile(t.get('source'));
            if (n.isAbsolutePath() || (n = new Pfile(i).addPath(t.get('source'))), t.has('dest')) {
                (a = new Pfile(t.get('dest'))).isAbsolutePath() || (a = new Pfile(i).addPath(t.get('dest')));
            } else var a = null;
            var s = new Array();
            t.has('include') && (s = t.get('include').split(this.privateJoinChar), expect(s, 'Array'));
            var l = new Array();
            t.has('exclude') && (l = t.get('exclude').split(this.privateJoinChar), expect(l, 'Array'));
            var o = 'never';
            t.has('overwrite') && 'always' != (o = t.get('overwrite')) && 'older' != o && 'never' != o && (o = 'never');
            var c = 'compare' == e ? 'false' : 'true';
            t.has('mkdir') && 'true' != (c = t.get('mkdir')) && 'false' != c && (c = 'false'), 
            t.delete('exec'), t.delete('include'), t.delete('exclude'), t.delete('overwrite'), 
            t.delete('mkdir');
            this.recurseFileSystem(n, a, e, r, t, s, l, o, c, 0);
        } else terminal.abnormal(blue(e), ' no ', red('<source>'), ' parameter provided, can not continue');
    }
    recurseFileSystem(e, r, t, i, n, a, s, l, o, c) {
        if (expect(e, 'Pfile'), expect(r, [ 'Pfile', 'null' ]), expect(t, 'String'), expect(i, 'Array'), 
        expect(n, 'Map'), expect(a, 'Array'), expect(s, 'Array'), expect(l, 'String'), expect(o, 'String'), 
        expect(c, 'Number'), 1 != this.halt) if (c > 10) terminal.abnormal(blue(t), ' halting recursion at ', green(r.name), ' which is 10 subdirectories deep'); else if (e.isDirectory()) {
            if (this.isExcluded(e, t, s, n)) return;
            if (null != r) {
                var u = r.name.indexOf(e.name);
                if (0 == u) {
                    var m = e.name.length, h = r.name.charAt(m);
                    if ('/' == h) return void terminal.invalid(blue(t), ' source path ', green(e.name), ' and destination path ', green(r.name), ' overlap. Halting to prevent infinite loop.');
                }
                if ('true' == o && r.mkDir(), !r.exists()) return void ('compare' == t ? (terminal.trace(blue(t), ' ', green(this.shortDisplayFilename(r.name)), ' does not exist in dest'), 
                this.compareMiscount++) : terminal.invalid(blue(t), ' destination path ', green(this.shortDisplayFilename(r.name)), ' does not exist, and ', green('mkdir'), ' is ', green('false')));
            }
            var p = new Bunch(e.name, '*', Bunch.FILE + Bunch.DIRECTORY), d = p.find(!1);
            for (let u = 0; u < d.length; u++) {
                var g = d[u], f = new Pfile(e).addPath(g), v = null == r ? null : new Pfile(r).addPath(g);
                this.recurseFileSystem(f, v, t, i, n, a, s, l, o, c + 1);
            }
        } else if (e.isFile()) {
            if (!this.isIncluded(e, t, a, n)) return;
            if (this.isExcluded(e, t, s, n)) return;
            if (null != r) {
                if (n.has('extension')) {
                    var b = n.get('extension');
                    '.' == b.charAt(0) && (b = b.substr(1)), r.replaceExtension(b);
                }
                if ('compare' == t) return void (r.exists() || (terminal.trace(blue(t), ' ', green(this.shortDisplayFilename(e.name)), ' is in source, but ', green(this.shortDisplayFilename(r.name)), ' is not in dest'), 
                this.compareMiscount++));
                var y = this.allowOverwrite(e, r, l);
                if (y < 0) return void (-230 == y ? this.verboseTrace(blue(t) + ' not overwriting because ' + green(this.shortDisplayFilename(e.name)) + blue(' same as ') + green(this.shortDisplayFilename(r.name)), n) : -240 == y ? this.verboseTrace(blue(t) + ' not overwriting because ' + green(this.shortDisplayFilename(e.name)) + blue(' older than ') + green(this.shortDisplayFilename(r.name)), n) : -300 == y ? this.verboseTrace(blue(t) + ' not overwriting because ' + green(this.shortDisplayFilename(r.name)) + blue(' already exists'), n) : terminal.logic(`allowOverwrite = ${y}`));
            }
            n.set('source', e.name), n.set('dest', null == r ? null : r.name);
            var x = this.replaceParamsWithValues(i, n), P = this.formatProgressMsg(t, e, r, x, 'shortForm');
            this.executeChildProcess(t, x, P, n);
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
        var n = r[0], a = (new Pfile(n), r.slice(1)), s = {
            cwd: this.instructionPfile.getPath(),
            stdio: [ 0, 1, 2 ]
        };
        try {
            this.regularTrace(t, i);
            var l = ChildProcess.spawnSync(n, a, s);
            0 != l.status && (terminal.warning(blue(e), ' halting with return code ', red(`${l.status}`)), 
            this.halt = !0);
        } catch (r) {
            if (-1 != r.message.indexOf('spawnSync') && -1 != r.message.indexOf('ENOENT')) terminal.abnormal(blue(e), ' executable file not found ', blue(n)); else {
                var o = r.message.replace('spawnSync', 'Couldn\'t start').replace('ENOENT', '(No such file or directory)');
                terminal.abnormal(blue(e), o);
            }
        }
    }
    formatProgressMsg(e, r, t, i, n) {
        if (expect(e, 'String'), expect(r, [ 'Pfile', 'null' ]), expect(t, [ 'Pfile', 'null' ]), 
        expect(i, 'Array'), expect(n, 'String'), 'shortForm' == n) {
            if (null == t) {
                var a = this.shortDisplayFilename(r.name);
                return blue(e) + ' ' + green(a);
            }
            a = this.shortDisplayFilename(r.name);
            var s = this.shortDisplayFilename(t.name);
            return blue(e) + ' ' + green(a) + ' --\x3e ' + green(s);
        }
        if ('argsForm' == n) {
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
        var n = e.name;
        for (let e = 0; e < t.length; e++) {
            var a = t[e].replace('\\', '\\\\').replace('^', '\\^').replace('$', '\\$').replace('.', '\\.').replace('+', '\\+').replace('(', '\\(').replace(')', '\\)').replace('?', '.?').replace('*', '.*'), s = new RegExp(a + '$');
            if (s.test(n)) return !0;
        }
        var l = t.join(', ');
        return this.verboseTrace(blue(r) + ' not including ' + green(this.shortDisplayFilename(n)) + ' because it does not match ' + blue(l), i), 
        !1;
    }
    isExcluded(e, r, t, i) {
        expect(e, 'Pfile'), expect(r, 'String'), expect(t, 'Array');
        var n = e.name;
        for (let e = 0; e < t.length; e++) {
            var a = t[e].replace('\\', '\\\\').replace('^', '\\^').replace('$', '\\$').replace('.', '\\.').replace('+', '\\+').replace('(', '\\(').replace(')', '\\)').replace('?', '.?').replace('*', '.*'), s = new RegExp(a + '$');
            if (s.test(n)) return this.verboseTrace(blue(r) + ' excluding ' + green(this.shortDisplayFilename(n)) + ' by request ' + blue(t[e]), i), 
            !0;
        }
        return !1;
    }
    allowOverwrite(e, r, t) {
        if (expect(e, 'Pfile'), expect(r, 'Pfile'), expect(t, 'String'), 'always' == t) return 100;
        if ('older' == t) {
            if (r.exists()) {
                var i = fs.statSync(r.name).mtime.getTime(), n = fs.statSync(e.name).mtime.getTime();
                return n > i ? 220 : n == i ? -230 : n < i ? -240 : (terminal.logic('allowOverwrite'), 
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
        for (let m = 0; m < r.children.length; m++) {
            var i = r.children[m], n = i.entityType;
            if ('PragmaEntity' != n && 'GraynoteEntity' != n) {
                if (i.attributes.size > 0) {
                    var a = Array.from(i.attributes.entries());
                    for (let r = 0; r < a.length; r++) {
                        var s = a[r][0], l = a[r][1];
                        if ('class' == s) terminal.warning(blue(e), ' parameter values beginning with FULL-STOP must be quoted ', red(l)); else if ('id' == s) terminal.warning(blue(e), ' parameter values beginning with HASHTAG must be quoted #', red(l)); else if ('style' == s) terminal.warning(blue(e), ' parameter values beginning with CIRCUMFLEX must be quoted ^', red(l)); else if ('role' == s) terminal.warning(blue(e), ' parameter values beginning with PLUS-SIGN must be quoted +', red(l)); else if ('property' == s) terminal.warning(blue(e), ' parameter values beginning with QUESTION-MARK must be quoted ?', red(l)); else if ('data-junctor' == s) terminal.warning(blue(e), ' parameter values beginning with TILDE must be quoted ~', red(l)); else if ('sourceref' == s || 'href' == s || 'src' == s || 'data' == s || 'action' == s || 'cite' == s) {
                            terminal.warning(blue(e), ' parameter values beginning with GRAVE-ACCENT must be quoted ', red(`\`${l}\``));
                        } else null == l && (l = s), terminal.warning(blue(e), ' parameter values beginning with ASTERISK must be quoted *', red(l));
                    }
                }
                if ('StandardEntity' == n) {
                    var o = i.name, c = this.removeQuotedDelimiters(i.innerText);
                    if ('include' == o) {
                        var u = t.has('include') ? t.get('include') + this.privateJoinChar + c : c;
                        t.set(o, u);
                    } else if ('exclude' == o) {
                        u = t.has('exclude') ? t.get('exclude') + this.privateJoinChar + c : c;
                        t.set(o, u);
                    } else 'overwrite' == o ? ('older' != c && 'always' != c && 'never' != c && terminal.warning(blue(e), ' the <overwrite> parameter is ', red(c), ' only ', blue('always | older | never'), ' are meaningful'), 
                    t.set(o, c)) : t.set(o, c);
                } else terminal.logic('Unhandled entity type ', green(n), ' in buildParameterMap');
            }
        }
        return t;
    }
    verifyUserParams(e, r) {
        expect(e, 'String'), expect(r, 'Map');
        var t = this.commands.get(e);
        expect(t, 'String');
        for (let [n, a] of r.entries()) {
            var i = `<${n}>`;
            -1 == t.indexOf(i) && terminal.warning(blue(e), ' does not use the parameter ', red(`<${n}>`), ' ignorning ', red(a));
        }
        var n = t.match(/(\<.*?\>)/g);
        if (null != n) for (let t = 0; t < n.length; t++) {
            var a = n[t].substr(1, n[t].length - 2);
            r.has(a) || terminal.warning(blue(e), ' expects a parameter named ', red(`<${a}>`));
        }
    }
    verifyBuiltinParams(e, r) {
        if (expect(e, 'String'), expect(r, 'Map'), 'copy' == e) var t = [ 'source', 'dest' ], i = [ 'include', 'exclude', 'overwrite', 'mkdir', 'extension', 'progress' ]; else if ('recurse' == e) t = [ 'source', 'exec' ], 
        i = [ 'dest', 'include', 'exclude', 'overwrite', 'mkdir', 'extension', 'progress' ]; else if ('compare' == e) t = [ 'source', 'dest' ], 
        i = [ 'include', 'exclude', 'extension' ]; else if ('run' == e) t = [ 'sh' ], i = [ 'progress' ]; else terminal.logic('verifyBuiltinParams');
        for (let [n, a] of r.entries()) t.includes(n) || i.includes(n) || terminal.warning(blue(e), ' does not use the parameter ', red(`<${n}>`), ', ignorning ', red(a));
        for (let i = 0; i < t.length; i++) r.has(t[i]) || terminal.warning(blue(e), ' expects a parameter named ', red(`<${t[i]}>`));
    }
    replaceParamsWithValues(e, r) {
        expect(e, 'Array'), expect(r, 'Map');
        var t = new Array();
        t.push(e[0]);
        for (let s = 1; s < e.length; s++) {
            var i = e[s];
            if ('<' == i.charAt(0) && '>' == i.charAt(i.length - 1)) {
                var n = i.substr(1, i.length - 2);
                if (r.has(n)) {
                    var a = r.get(n);
                    t.push(a);
                    continue;
                }
            }
            t.push(e[s]);
        }
        return t;
    }
    removeQuotedDelimiters(e) {
        var r = (e = e.trim()).charAt(0), t = e.charAt(e.length - 1);
        return r != t || '\'' != r && '"' != r ? e : e.substr(1, e.length - 2);
    }
};