#!/usr/bin/env node
/*
    Copyright (c) 2014 Bastien Clément <g@ledric.me>

    Permission is hereby granted, free of charge, to any person obtaining a
    copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:

    The above copyright notice and this permission notice shall be included
    in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
    OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
    IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
    CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
    TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
    SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import StreamServer from "./stream.js";
import TorrentEngine from "./torrent.js";
import {bytes, pad } from "./utils.js";
import fs from "fs";
import path from "path";
import readline from "readline";
import rc from "rc";
import chalk from "chalk";

let argv = rc("tget")

// Alias long options
if(argv.connections) argv.c = argv.connections;
if(argv.dht) argv.d = argv.dht;
if(argv.ephemeral) argv.e = argv.ephemeral;
if(argv.idle) argv.i = argv.idle;
if(argv.listen) argv.l = argv.listen;
if(argv.peer) argv.p = argv.peer;
if(argv.quiet) argv.q = argv.quiet;
if(argv.stream) argv.s = argv.stream;
if(argv.notracker) argv.t = argv.notracker;
if(argv.uploads) argv.u = argv.uploads;
if(argv.wait) argv.w = argv.wait;

// Options check
if(argv.w && !argv.s) {
    console.error(chalk.bgRed("-w option requires -s"));
   process.exit(false) 
}

if(argv.w) {
    argv.e = true;
    argv.i = true;
}

let verbose = !argv.q;

//
// File stream mode
//
if(argv.S) {
    let local_path;
    if(!(local_path = argv._[0])) {
        local_path = argv.S;
        argv.S = 8888;
    }

    if(!fs.existsSync(local_path)) {
        console.error("Usage: tget -S [port] <path>");
        process.exit(true);
    }

    let files = [];

    function torrentize(file) {
        let stat = fs.lstatSync(file);
        if(stat.isDirectory()) {
            fs.readdirSync(file).forEach(function(sub_file) {
                torrentize(path.join(file, sub_file));
            });
        } else {
            files.push({
                name: file,
                length: stat.size,
                createReadStream: function(opts) {
                    return fs.createReadStream(file, opts);
                }
            });
        }
    }

    // Fake torrent-stream files structure
    torrentize(local_path);

    StreamServer.init(argv.S, files);

    if(verbose) {
        console.log("Available files:");
        files.forEach(function(file, i) {
            console.log("  [" + (i+1) + "] " + file.name);
        });

        console.log("\nLocal streaming enabled on port " + StreamServer.port + " (default file is " + StreamServer.def_idx + ")");
    }
    process.exit(0);
}

//
// Torrent download mode
//
TorrentEngine.load(argv._[0], argv, function(torrent) {
    // Missing or invalid argument
    if(!torrent) {
        console.error(chalk.yellowBright.bold("Usage: tget <path|url|magnet> [options]"));
        process.exit(false);
    }

    TorrentEngine.init(torrent);

    // Create command line interface
    let rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Exit tget
    function do_exit() {
        rl.write("\n");
        rl.close();
        process.exit(0);
    }

    // Exit safety check
    let exiting = false;
    function exit(force) {
        if(!force && (!TorrentEngine.done || StreamServer.open_streams > 0 || argv.i)) return;

        if(exiting) {
            do_exit();
        } else {
            exiting = true;
        }

        TorrentEngine.exit(do_exit);
    }

    // Forceful exit
    rl.on("SIGINT", function() {
        process.exit(true);
    });

    rl.setPrompt("");
    if(verbose) rl.write(chalk.yellowBright.bold("Initializing torrent engine..."));

    TorrentEngine.on("ready", function() {
        if(verbose) {
            rl.write(chalk.green.bold(" Ready.\n\n"));

            rl.write(chalk.blue.bold("Downloading files:\n"));
            TorrentEngine.files.forEach(function(file, i) {
                rl.write(chalk.cyan("  [" + (i+1) + "] " + file.path + "\n"));
            });

            rl.write("\n");
        }

        function print_progress() {
            let buf = [];

            // Percent indicator
            let percent = TorrentEngine.downloadPercent();
            buf.push(chalk.magentaBright(pad(percent, 3) + "%"));
            buf.push(" ");

            // Progress bar
            let twens_percent = Math.floor(percent*2.5/10);
            buf.push(chalk.greenBright("["));
            buf.push(chalk.greenBright.bold("==============================".slice(0, twens_percent)));
            buf.push(chalk.greenBright.bold(twens_percent ? ">" : " "));
            buf.push(chalk.greenBright("                              ".slice(0, 25-twens_percent)));
            buf.push(chalk.greenBright("]"));
            buf.push("  ");

            // Downloaded bytes
            buf.push(chalk.yellow.bold(bytes(TorrentEngine.downloadedBytes())));
            buf.push("  ");

            // Download speed
            buf.push(chalk.yellow.bold(bytes(TorrentEngine.downloadSpeed())));
            buf.push(chalk.yellow.bold("/s"));
            buf.push("  ");

            // Peers informations
            function active(wire) {
                return !wire.peerChoking;
            }

            buf.push(chalk.yellow.bold(TorrentEngine.wires.filter(active).length));
            buf.push(chalk.yellow.bold("/"));
            buf.push(chalk.yellow.bold(TorrentEngine.wires.length));
            buf.push(chalk.yellow.bold(" peers"));
            buf.push("  ");

            // Stream informations
            if(StreamServer.enabled) {
                buf.push(chalk.yellow.bold(StreamServer.open_streams));
                buf.push(chalk.yellow.bold(" streams"));
            }

            // ETA
            buf.push(chalk.yellow.bold("ETA: "));
            buf.push(chalk.yellow.bold(TorrentEngine.etaTime()));

            rl.write(buf.join(""));
        }

        function clear_line() {
            // Erase the last printed line
            rl.write("", { ctrl: true, name: "u" });
        }

        let throttle = false;
        function update_gui(done) {
            if(done || !throttle) {
                clear_line();
                print_progress();
                throttle = true;
                setTimeout(function() {
                    throttle = false;
                }, 1000);
            }
        }

        if(verbose) setInterval(update_gui, 1000);

        // Download is fully done
        TorrentEngine.on("done", function() {
            if(verbose) update_gui(true);
            process.exit(false);
        });

        // Init streaming server
        if(argv.s) {
            StreamServer.init(argv.s, TorrentEngine.files);

            if(verbose) {
                rl.write("Streaming enabled on port " + StreamServer.port);
                if(StreamServer.use_m3u) {
                    rl.write(" (using m3u playlist)");
                } else {
                    rl.write(" (default file is " + StreamServer.def_idx + ")");
                }
                rl.write("\n\n");
            }

            StreamServer.on("stream-close", function() {
                process.exit(false);
            });
        }

        // Initial progress bar painting
        if(verbose) update_gui();
    });
});
