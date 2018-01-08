var expect = require('joezone').expect, Pfile = require('joezone').Pfile, Bunch = require('joezone').Bunch, terminal = require('joezone').terminal, FileInterface = require('bluephrase').FileInterface, RootEntity = require('bluephrase').RootEntity, EntityPath = require('bluephrase').EntityPath, TT = require('bluephrase').TT, fs = require('fs'), ChildProcess = require('child_process');

terminal.setProcessName('[prn]');

var gray = terminal.gray, red = terminal.red, green = terminal.green, yellow = terminal.yellow, blue = terminal.blue;

module.exports = class Prorenata {
    constructor() {
        this.instructionPfile = null, this.root = null, this.commands = new Map(), this.privateJoinChar = '|', 
        this.setup(), Object.seal(this);
    }
    setup() {
        this.commands.set('template', 'builtin'), this.commands.set('copy', 'builtin'), 
        this.commands.set('recurse', 'builtin'), this.commands.set('run', 'builtin');
    }
    execute() {
        process.argv.length <= 2 ? terminal.invalid('usage: prn scriptfile') : (this.instructionPfile = new Pfile(process.argv[2]), 
        this.instructionPfile.makeAbsolute(), this.instructionPfile.exists() ? (this.readInstructions(), 
        this.processInstructions()) : terminal.invalid(yellow(this.instructionPfile.name), ' not found'));
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
        for (let r = 0; r < this.root.children.length; r++) {
            var e = this.root.children[r], t = e.entityType;
            if ('GroupEntity' == t || 'StandardEntity' == t) this.processCommand(e); else if ('GraynoteEntity' == t) e.tokenType == TT.GRAYNOTE_COMMENT && terminal.trace(gray(e.value.trim())); else {
                if ('PragmaEntity' == t) continue;
                terminal.logic('Unhandled entityType ', blue(e.entityType));
            }
        }
    }
    processCommand(e) {
        expect(e, [ 'GroupEntity', 'StandardEntity' ]);
        var t = e.name;
        if (this.commands.has(t)) {
            var r = this.commands.get(t);
            'builtin' == r ? this.processBuiltinCommand(t, e) : this.processUserDefinedCommand(t, r, e);
        } else terminal.warning('The command ', blue(t), ' has not been defined');
    }
    processBuiltinCommand(e, t) {
        switch (expect(e, 'String'), expect(t, 'GroupEntity'), e) {
          case 'template':
            this.processTemplateCommand(t);
            break;

          case 'copy':
            this.processCopyCommand(t);
            break;

          case 'recurse':
            this.processRecurseCommand(t);
            break;

          case 'run':
            this.processRunCommand(t);
            break;

          default:
            terminal.logic('Unhandled builtin command ', blue(e));
        }
    }
    processUserDefinedCommand(e, t, r) {
        expect(e, 'String'), expect(t, 'String'), expect(r, [ 'GroupEntity', 'StandardEntity' ]);
        var i = this.buildParameterMap(e, r);
        this.verifyUserParams(e, i);
        var n = t.split(' '), a = this.replaceParamsWithValues(n, i);
        this.executeChildProcess(e, a, null, null);
    }
    processTemplateCommand(e) {
        expect(e, 'GroupEntity');
        for (let a = 0; a < e.children.length; a++) {
            var t = e.children[a], r = t.entityType;
            if ('StandardEntity' == r) {
                var i = t.name, n = t.innerText;
                this.commands.set(i, n);
            } else {
                if ('PragmaEntity' == r || 'GraynoteEntity' == r) continue;
                terminal.logic('Unhandled entity type ', yellow(r), ' in processTemplateCommand');
            }
        }
    }
    processCopyCommand(e) {
        expect(e, 'GroupEntity');
        var t = this.buildParameterMap('copy', e);
        this.verifyBuiltinParams('copy', t);
        var r = [ 'cp', '--preserve', '<source>', '<dest>' ];
        this.beginRecursion('copy', r, t);
    }
    processRecurseCommand(e) {
        expect(e, 'GroupEntity');
        var t = this.buildParameterMap('recurse', e);
        this.verifyBuiltinParams('recurse', t);
        var r = t.get('exec').trim();
        if (this.commands.has(r)) {
            var i = this.commands.get(r);
            expect(i, 'String');
            var n = i.split(' ');
            this.beginRecursion(r, n, t);
        } else terminal.warning(blue('recurse '), yellow('<exec>'), ' specifies an undefined command ', red(r));
    }
    processRunCommand(e) {
        expect(e, 'GroupEntity');
        for (let l = 0; l < e.children.length; l++) {
            var t = e.children[l], r = t.entityType;
            if ('StandardEntity' == r) {
                var i = t.name, n = t.innerText;
                if ('sh' != i) return void terminal.abnormal(blue('run'), ' items within this command should be preceeded by ', yellow(sh), ' ignoring ', red(i), ' ', red(n));
                var a = n.split(' ');
                this.executeChildProcess('run', a, null, null);
            } else {
                if ('PragmaEntity' == r || 'GraynoteEntity' == r) continue;
                terminal.logic('Unhandled entity type ', yellow(r), ' in processRunCommand');
            }
        }
    }
    beginRecursion(e, t, r) {
        expect(e, 'String'), expect(t, 'Array'), expect(r, 'Map'), expect(this.instructionPfile, 'Pfile');
        var i = this.instructionPfile.getPath(), n = new Pfile(i).addPath(r.get('source')), a = new Pfile(i).addPath(r.get('dest')), l = new Array();
        r.has('include') && (l = r.get('include').split(this.privateJoinChar), expect(l, 'Array'));
        var s = new Array();
        r.has('exclude') && (s = r.get('exclude').split(this.privateJoinChar), expect(s, 'Array'));
        var c = 'never';
        r.has('overwrite') && (c = r.get('overwrite')), r.delete('exec'), r.delete('include'), 
        r.delete('exclude'), r.delete('overwrite'), this.recurseFileSystem(n, a, e, t, r, l, s, c);
    }
    recurseFileSystem(e, t, r, i, n, a, l, s) {
        if (expect(e, 'Pfile'), expect(t, 'Pfile'), expect(r, 'String'), expect(i, 'Array'), 
        expect(n, 'Map'), expect(a, 'Array'), expect(l, 'Array'), e.isDirectory()) {
            if (this.isExcluded(e, r, l)) return;
            t.mkDir();
            var c = new Bunch(e.name, '*', Bunch.FILE + Bunch.DIRECTORY), o = c.find(!1);
            for (let c = 0; c < o.length; c++) {
                var u = o[c], m = new Pfile(e).addPath(u), d = new Pfile(t).addPath(u);
                this.recurseFileSystem(m, d, r, i, n, a, l, s);
            }
        } else if (e.isFile()) {
            if (!this.isIncluded(e, r, a)) return;
            if (this.isExcluded(e, r, l)) return;
            if (!this.allowOverwrite(e, t, s)) return void ('older' == s ? terminal.trace(blue(r), ' not overwriting because ', yellow(this.shortDisplayFilename(e.name)), blue(' older than / same as '), yellow(this.shortDisplayFilename(t.name))) : terminal.trace(blue(r), ' not overwriting because ', yellow(this.shortDisplayFilename(t.name)), blue(' already exists')));
            var p = this.shortDisplayFilename(e.name), h = this.shortDisplayFilename(t.name);
            n.set('source', e.name), n.set('dest', t.name);
            var y = this.replaceParamsWithValues(i, n);
            this.executeChildProcess(r, y, p, h);
        } else terminal.warning(blue(r), ' ', e.name, red(' NOT FOUND'));
    }
    executeChildProcess(e, t, r, i) {
        expect(e, 'String'), expect(t, 'Array'), expect(r, [ 'String', 'null' ]), expect(i, [ 'String', 'null' ]);
        var n = t[0], a = (new Pfile(n), t.slice(1)), l = {
            cwd: this.instructionPfile.getPath(),
            stdio: [ 0, 1, 2 ]
        };
        try {
            var s = '';
            if (null == r && null == i) {
                for (let e = 0; e < a.length; e++) s += ' ' + this.shortDisplayFilename(a[e]);
                s = yellow(s);
            } else s = ' ' + yellow(r) + ' --\x3e ' + yellow(i);
            terminal.trace(blue(e), ' ', n, s), ChildProcess.spawnSync(n, a, l);
        } catch (t) {
            if (-1 != t.message.indexOf('spawnSync') && -1 != t.message.indexOf('ENOENT')) terminal.abnormal(blue(e), ' executable file not found ', blue(n)); else {
                var c = t.message.replace('spawnSync', 'Couldn\'t start').replace('ENOENT', '(No such file or directory)');
                terminal.abnormal(blue(e), c);
            }
        }
    }
    shortDisplayFilename(e) {
        var t = this.instructionPfile.getPath();
        if (0 == e.indexOf(t)) return e.substr(t.length + 1);
        for (;-1 != t.indexOf('/'); ) {
            var r = t.split('/');
            if (r.pop(), t = r.join('/'), 0 == e.indexOf(t)) {
                var i = e.substr(t.length);
                return '/' == i.charAt(0) ? i.substr(1) : i;
            }
        }
        return e;
    }
    isIncluded(e, t, r) {
        if (expect(e, 'Pfile'), expect(t, 'String'), expect(r, 'Array'), 0 == r.length) return !0;
        var i = e.name;
        for (let e = 0; e < r.length; e++) {
            var n = r[e].replace('\\', '\\\\').replace('^', '\\^').replace('$', '\\$').replace('.', '\\.').replace('+', '\\+').replace('(', '\\(').replace(')', '\\)').replace('?', '.?').replace('*', '.*'), a = new RegExp(n + '$');
            if (a.test(i)) return !0;
        }
        var l = r.join(', ');
        return terminal.trace(blue(t), ' not including ', yellow(this.shortDisplayFilename(i)), ' because it does not match ', blue(l)), 
        !1;
    }
    isExcluded(e, t, r) {
        expect(e, 'Pfile'), expect(t, 'String'), expect(r, 'Array');
        var i = e.name;
        for (let e = 0; e < r.length; e++) {
            var n = r[e].replace('\\', '\\\\').replace('^', '\\^').replace('$', '\\$').replace('.', '\\.').replace('+', '\\+').replace('(', '\\(').replace(')', '\\)').replace('?', '.?').replace('*', '.*'), a = new RegExp(n + '$');
            if (a.test(i)) return terminal.trace(blue(t), ' excluding ', yellow(this.shortDisplayFilename(i)), ' by request ', blue(r[e])), 
            !0;
        }
        return !1;
    }
    allowOverwrite(e, t, r) {
        return expect(e, 'Pfile'), expect(t, 'Pfile'), expect(r, 'String'), 'always' == r || ('never' == r ? !t.exists() : 'older' == r ? !t.exists() || fs.statSync(t.name).mtime < fs.statSync(e.name).mtime : (terminal.logic('Unhandled overwriteRule ', red(r)), 
        !1));
    }
    buildParameterMap(e, t) {
        expect(e, 'String'), expect(t, [ 'GroupEntity', 'StandardEntity' ]);
        var r = new Map();
        if ('StandardEntity' == t.constructor.name) return r;
        for (let m = 0; m < t.children.length; m++) {
            var i = t.children[m], n = i.entityType;
            if ('PragmaEntity' != n && 'GraynoteEntity' != n) {
                if (i.attributes.size > 0) {
                    var a = Array.from(i.attributes.entries());
                    for (let t = 0; t < a.length; t++) {
                        var l = a[t][0], s = a[t][1];
                        if ('class' == l) terminal.warning(blue(e), ' parameter values beginning with FULL-STOP must be quoted ', red(s)); else if ('id' == l) terminal.warning(blue(e), ' parameter values beginning with HASHTAG must be quoted #', red(s)); else if ('style' == l) terminal.warning(blue(e), ' parameter values beginning with CIRCUMFLEX must be quoted ^', red(s)); else if ('role' == l) terminal.warning(blue(e), ' parameter values beginning with PLUS-SIGN must be quoted +', red(s)); else if ('property' == l) terminal.warning(blue(e), ' parameter values beginning with QUESTION-MARK must be quoted ?', red(s)); else if ('data-junctor' == l) terminal.warning(blue(e), ' parameter values beginning with TILDE must be quoted ~', red(s)); else if ('sourceref' == l || 'href' == l || 'src' == l || 'data' == l || 'action' == l || 'cite' == l) {
                            terminal.warning(blue(e), ' parameter values beginning with GRAVE-ACCENT must be quoted ', red(`\`${s}\``));
                        } else null == s && (s = l), terminal.warning(blue(e), ' parameter values beginning with ASTERISK must be quoted *', red(s));
                    }
                }
                if ('StandardEntity' == n) {
                    var c = i.name, o = this.removeQuotedDelimiters(i.innerText);
                    if ('include' == c) {
                        var u = r.has('include') ? r.get('include') + this.privateJoinChar + o : o;
                        r.set(c, u);
                    } else if ('exclude' == c) {
                        u = r.has('exclude') ? r.get('exclude') + this.privateJoinChar + o : o;
                        r.set(c, u);
                    } else 'overwrite' == c ? ('older' != o && 'always' != o && 'never' != o && terminal.warning(blue(e), ' the <overwrite> parameter is ', red(o), ' only ', blue('always | older | never'), ' are meaningful'), 
                    r.set(c, o)) : r.set(c, o);
                } else terminal.logic('Unhandled entity type ', yellow(n), ' in buildParameterMap');
            }
        }
        return r;
    }
    verifyUserParams(e, t) {
        expect(e, 'String'), expect(t, 'Map');
        var r = this.commands.get(e);
        expect(r, 'String');
        for (let [n, a] of t.entries()) {
            var i = `<${n}>`;
            -1 == r.indexOf(i) && terminal.warning(blue(e), ' does not use the parameter ', red(`<${n}>`), ' ignorning ', red(a));
        }
        var n = r.match(/(\<.*?\>)/g);
        if (null != n) for (let r = 0; r < n.length; r++) {
            var a = n[r].substr(1, n[r].length - 2);
            t.has(a) || terminal.warning(blue(e), ' expects a parameter named ', red(`<${a}>`));
        }
    }
    verifyBuiltinParams(e, t) {
        if (expect(e, 'String'), expect(t, 'Map'), 'copy' == e) var r = [ 'source', 'dest' ], i = [ 'include', 'exclude', 'overwrite', 'onfailure' ]; else if ('recurse' == e) r = [ 'source', 'exec' ], 
        i = [ 'dest', 'include', 'exclude', 'overwrite', 'onfailure' ]; else terminal.logic('Unexpected cmd ', red(e));
        for (let [n, a] of t.entries()) r.includes(n) || i.includes(n) || terminal.warning(blue(e), ' does not use the parameter ', red(`<${n}>`), ', ignorning ', red(a));
        for (let i = 0; i < r.length; i++) t.has(r[i]) || terminal.warning(blue(e), ' expects a parameter named ', red(`<${r[i]}>`));
    }
    replaceParamsWithValues(e, t) {
        expect(e, 'Array'), expect(t, 'Map');
        var r = new Array();
        r.push(e[0]);
        for (let l = 1; l < e.length; l++) {
            var i = e[l];
            if ('<' == i.charAt(0) && '>' == i.charAt(i.length - 1)) {
                var n = i.substr(1, i.length - 2);
                if (t.has(n)) {
                    var a = t.get(n);
                    r.push(a);
                    continue;
                }
            }
            r.push(e[l]);
        }
        return r;
    }
    removeQuotedDelimiters(e) {
        var t = (e = e.trim()).charAt(0), r = e.charAt(e.length - 1);
        return t != r || '\'' != t && '"' != t ? e : e.substr(1, e.length - 2);
    }
};