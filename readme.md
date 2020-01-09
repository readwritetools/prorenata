







<figure>
	<img src='/img/tasks/prorenata/prorenata-unsplash-hush-naidoo.jpg' width='100%' />
	<figcaption></figcaption>
</figure>

# Prorenata

## P.R.N. (As the circumstance arises)


<address>
<img src='/img/rwtools.png' width=80 /> by <a href='https://readwritetools.com' title='Read Write Tools'>Read Write Tools</a> <time datetime=2016-10-19>Nov 19, 2016</time></address>



<table>
	<tr><th>Abstract</th></tr>
	<tr><td>The <span class=product>prorenata</span> build tool is used to execute a sequence of commands on a hierarchy of file paths, using parameters that are defined with a declarative approach, rather than a procedural approach.</td></tr>
</table>

### Motivation

The venerable `make` command is the inspiration for <span>prorenata</span>.

Building, testing and deploying software requires a sequence a steps which need
to be followed each time a file or one of its dependencies changes. In most
cases, these steps should be conditioned on file timestamps, where a step should
only be redone when the output of its previous execution is older than the
corresponding input file's timestamp. In other words, only execute the step on
an as needed basis.

The name of this utility comes from nursing jargon *prorenata* (p.r.n.) which
means "as the circumstance arises".

### Prerequisites and installation

The <span>prorenata</span> utility uses Node.js. Package installation is
done via NPM.

This utility requires the BLUE-PHRASE parser, which is distributed with each
copy of validly licensed Read Write Tools premium tools.

To install the utility and make it available to your Bash shell, use this
command.

```bash
[user@host]# npm install -g prorenata
```

### Usage

The software is invoked from the command line with:

```bash
[user@host]# renata [script-file]
```

The script file contains commands in this form:

```prorenata
command {
   parameter value
}
```

#### Commands

There are 6 built-in commands:

   1. `copy` recursively copies all files in <source> to <dest>
   2. `compare` lists files that are in <source> but not in <dest>
   3. `clean` removes <dependent> files that are older than <trigger>
   4. `recurse` runs a template-defined command recursively over all files in <source>
   5. `run` executes an arbitrary shell command
   6. `template` defines new commands for use with the <exec> parameter of `recurse`

Any name that does not match one of these 6 is considered to be a user-defined
command, and it may be used as a command in a `template`.

#### Parameters

The are 15 built-in parameters:

   1. `source` an absolute or relative path
   2. `dest` an absolute or relative path
   3. `include+`  a file pattern to include, if omitted defaults to '*'
   4. `exclude+`  a file pattern to exclude
   5. `extension` the filename extension to apply to destination filenames
   6. `exec` a command name defined in the `template` section
   7. `overwrite:` `always | older | never‡`
   8. `mkdir:` `true‡ | false` (create missing directories)
   9. `preserve:` `true | false‡` (preserve timestamps)
   10. `trigger`  an absolute or relative filename
   11. `dependent+`  an absolute or relative path
   12. `sh+` a shell command to execute
   13. `if+` a conditional `if [hostname ==] | [hostname !=] then ... else ...`
   14. `progress:` `verbose | regular‡ | none`
   15. `onerror:` `continue | halt‡`

<small>+  parameter that may
be provided multiple times</small>

<small>‡  optional parameter default value</small>

Any name that does not match one of these 15 is considered to be a user-defined
parameter. Both built-in and user-defined parameters may be used as substitution
variables in a template.

The parameters that may be used with each command are:


<table>
	<tr><td class=code>copy</td>  <td>source* | dest* | include | exclude | extension | overwrite | mkdir | preserve | progress | onerror</td></tr>
	<tr><td class=code>compare</td>  <td>source* | dest* | include | exclude | extension | onerror</td></tr>
	<tr><td class=code>clean</td>  <td>trigger* | dependent* | progress | onerror</td></tr>
	<tr><td class=code>recurse</td>  <td>source* | exec* | include | exclude | extension | overwrite | mkdir | progress | dest | onerror</td></tr>
	<tr><td class=code>run</td>  <td>sh | if | progress | onerror</td></tr>
</table>

<small>* required parameter</small>

A pair of less-than and greater-than characters are used to enclose a named
substitution variable. Use substitutions with `recurse`, `copy` and `compare` commands.
Place substitution variables in a template, and the current path or filename
will be substituted.

The substitution variables:


<table>
	<tr><td class=code>source</td> <td>The absolute path and filename of the current source file</td></tr>
	<tr><td class=code>sourcepath</td> <td>The local path of the current source file</td></tr>
	<tr><td class=code>sourcefile</td> <td>The current source filename only</td></tr>
	<tr><td class=code>dest</td> <td>The absolute path and filename of the current dest file</td></tr>
	<tr><td class=code>destpath</td> <td>The local path of the current dest file</td></tr>
	<tr><td class=code>destfile</td> <td>The current dest filename only</td></tr>
</table>

#### Examples

Here is an example using `copy` to recursively copy files with *.html extension
from 'foo' to 'bar'

```prorenata
copy {
   source  foo
   dest    bar
   include '*.html'
}
```

Here is an example using `template` and `recurse` to compile LESS into CSS from
'foo' to 'bar'

```prorenata
template {
   compile-css lessc <source> <dest>
}
recurse {
   source    foo
   dest      bar
   include   '*.less'
   extension '.css'
   exec      compile-css
}
```

Here is an example using `template` and a user-defined command to count the number
of files in 'foo' with an 'html' extension

```prorenata
template {
   count-by-ext ls -l <path> | grep <ext> | wc -l
}
count-by-ext {
   path      foo
   ext       html
}
```

### License

The <span>prorenata</span> command line utility is licensed under the MIT
License.

<img src='/img/blue-seal-mit.png' width=80 align=right />

<details>
	<summary>MIT License</summary>
	<p>Copyright © 2020 Read Write Tools.</p>
	<p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:</p>
	<p>The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.</p>
	<p>THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p>
</details>

### Availability


<table>
	<tr><td>Source code</td> 			<td><a href='https://github.com/readwritetools/prorenata'>github</a></td></tr>
	<tr><td>Package installation</td> <td><a href='https://www.npmjs.com/package/prorenata'>NPM</a></td></tr>
	<tr><td>Documentation</td> 		<td><a href='https://hub.readwritetools.com/tasks/prorenata.blue'>Read Write Hub</a></td></tr>
</table>

