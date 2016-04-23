/**
 * Copyright 2013,2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";
    var spawn = require('child_process').spawn;
    var exec = require('child_process').exec;
    var isUtf8 = require('is-utf8');

    function ExecNode(n) {
        RED.nodes.createNode(this,n);
        this.cmd = (n.command || "").trim();
        if (n.addpay === undefined) { n.addpay = true; }
        this.addpay = n.addpay;
        this.append = (n.append || "").trim();
        this.useSpawn = n.useSpawn;
        this.activeProcesses = {};

        var node = this;
        this.on("input", function(msg) {
            node.status({fill:"blue",shape:"dot",text:" "});
            if (this.useSpawn === true) {
                // make the extra args into an array
                // then prepend with the msg.payload

                var arg = node.cmd;
                if (node.addpay) {
                    arg += " "+msg.payload;
                }
                arg += " "+node.append;
                // slice whole line by spaces (trying to honour quotes);
                arg = arg.match(/(?:[^\s"]+|"[^"]*")+/g);
                var cmd = arg.shift();
                /* istanbul ignore else  */
                if (RED.settings.verbose) { node.log(cmd+" ["+arg+"]"); }
                if (cmd.indexOf(" ") == -1) {
                    var ex = spawn(cmd,arg);
                    node.activeProcesses[ex.pid] = ex;
                    ex.stdout.on('data', function (data) {
                        //console.log('[exec] stdout: ' + data);
                        if (isUtf8(data)) { msg.payload = data.toString(); }
                        else { msg.payload = data; }
                        node.send([msg,null,null]);
                    });
                    ex.stderr.on('data', function (data) {
                        //console.log('[exec] stderr: ' + data);
                        if (isUtf8(data)) { msg.payload = data.toString(); }
                        else { msg.payload = new Buffer(data); }
                        node.send([null,msg,null]);
                    });
                    ex.on('close', function (code) {
                        //console.log('[exec] result: ' + code);
                        delete node.activeProcesses[ex.pid];
                        msg.payload = code;
                        if (code === 0) { node.status({}); }
                        else if (code < 0) { node.status({fill:"red",shape:"dot",text:"rc: "+code}); }
                        else { node.status({fill:"yellow",shape:"dot",text:"rc: "+code}); }
                        node.send([null,null,msg]);
                    });
                    ex.on('error', function (code) {
                        delete node.activeProcesses[ex.pid];
                        node.error(code,msg);
                    });
                }
                else { node.error(RED._("exec.spawnerr")); }
            }
            else {
                var cl = node.cmd;
                if ((node.addpay === true) && ((msg.payload || "").toString().trim() !== "")) { cl += " "+msg.payload; }
                if (node.append.trim() !== "") { cl += " "+node.append; }
                /* istanbul ignore else  */
                if (RED.settings.verbose) { node.log(cl); }
                var child = exec(cl, {encoding: 'binary', maxBuffer:10000000}, function (error, stdout, stderr) {
                    msg.payload = new Buffer(stdout,"binary");
                    try {
                        if (isUtf8(msg.payload)) { msg.payload = msg.payload.toString(); }
                    } catch(e) {
                        node.log(RED._("exec.badstdout"));
                    }
                    var msg2 = {payload:stderr};
                    var msg3 = null;
                    //console.log('[exec] stdout: ' + stdout);
                    //console.log('[exec] stderr: ' + stderr);
                    if (error !== null) {
                        msg3 = {payload:error};
                        //console.log('[exec] error: ' + error);
                    }
                    node.status({});
                    node.send([msg,msg2,msg3]);
                    delete node.activeProcesses[child.pid];
                });
                child.on('error',function() {});
                node.activeProcesses[child.pid] = child;
            }
        });
        this.on('close',function() {
            for (var pid in node.activeProcesses) {
                /* istanbul ignore else  */
                if (node.activeProcesses.hasOwnProperty(pid)) {
                    node.activeProcesses[pid].kill();
                }
            }
            node.activeProcesses = {};
        });
    }
    RED.nodes.registerType("exec",ExecNode);
}
