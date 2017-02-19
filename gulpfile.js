const os = require('os');
const gulp = require('gulp');
const gulpSequence = require('gulp-sequence');
const Promise = require('bluebird');
const gutil = require('gulp-util');
const fs = Promise.promisifyAll(require('fs-extra'));
const path = require('path');
const ProgressBar = require('ascii-progress');
const request = require('request');
const progress = require('request-progress');
const targz = require('targz');
const decompress = Promise.promisify(targz.decompress);
const cp = require('child-process-es6-promise');
const decompressZip = require('decompress');

const RethinkDBVersion = "2.3.5";

gulp.task('rethinkdb', () => {
    return new Promise((resolve, reject) => {
        return fs.ensureDirAsync(path.join(__dirname, '/RethinkDB/')).then(() => {
            return new Promise((resolve, reject) => {
                gutil.log(`The os type is ${os.platform()}, arch ${os.arch()}`);
                switch (os.platform()) {
                    case "darwin":
                        resolve(RethinkDBLinuxAndDarwin);
                        break;
                    case "win32":
                        switch (os.arch()) {
                            case "x64":
                                resolve();
                                break;
                            default:
                                reject(`Your os ${os.platform()} ${os.arch()} is not supported.`);
                                break;
                        }
                        break;
                    case "linux":
                        resolve(RethinkDBLinuxAndDarwin);
                        break;
                    default:
                        reject(`Your os ${os.platform()} ${os.arch()} is not supported.`);
                        break;
                }
            })
                .then((SetUp) => {
                    gutil.log(`Start setup...`);
                    return SetUp();
                }).then(() => {
                    resolve();
                }).catch((e) => {
                    reject(e);
                });
        });
    }).catch(e => {
        gutil.log(e);
    });
});

gulp.task('rethinkdb-windows', () => {
    return RethinkDBWinodws();
});

gulp.task('rethinkdb-mac', () => {
    return RethinkDBLinuxAndDarwin();
});

gulp.task('rethinkdb-linux', () => {
    return RethinkDBLinuxAndDarwin();
});

function RethinkDBWinodws() {
    return new Promise((resolve, reject) => {
        const ExePath = path.join(__dirname, '/RethinkDB/rethinkdb.exe');
        gutil.log(`Check ${ExePath} ...`);
        fs.accessAsync(ExePath, fs.constants.F_OK | fs.constants.R_OK)
            .then(() => {
                return CopyBinaryWindows(ExePath);
            })
            .then(() => {
                resolve();
            })
            .catch((e) => {
                const ZipPath = path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}.zip`);
                gutil.log(`Check ${ZipPath} ...`);
                return fs.accessAsync(ZipPath, fs.constants.F_OK | fs.constants.R_OK)
                    .then(() => {
                        return UnpackWindows(ZipPath);
                    })
                    .then(() => {
                        return CopyBinaryWindows(path.join(__dirname, `/RethinkDB/rethinkdb.exe`));
                    })
                    .then(() => {
                        resolve();
                    })
                    .catch((e) => {
                        gutil.log(`Download rethinkdb-${RethinkDBVersion} ...`);
                        DoDownload(`rethinkdb-${RethinkDBVersion}`, `https://download.rethinkdb.com/windows/rethinkdb-${RethinkDBVersion}.zip`, ZipPath)
                            .catch((e) => {
                                reject(e);
                            })
                            .then(() => {
                                return UnpackWindows(ZipPath);
                            })
                            .then(() => {
                                return CopyBinaryWindows(path.join(__dirname, `/RethinkDB/rethinkdb.exe`));
                            })
                            .then(() => {
                                resolve();
                            })
                    })
            });
    });
}

function UnpackWindows(ZipPath) {
    gutil.log(`Unpack ${ZipPath} to ${path.join(__dirname + '/RethinkDB/')} ...`);
    return decompressZip(ZipPath, path.join(__dirname + '/RethinkDB/'))
        .then(() => {
            gutil.log(`Unpacked!`);
        })
}

function CopyBinaryWindows(Path) {
    const dest = path.join(__dirname, '/RethinkDB/bin/rethinkdb');
    gutil.log(`Copy ${Path} to ${dest} ...`);
    return fs.copyAsync(Path, dest, {overwrite: true});
}

function RethinkDBLinuxAndDarwin() {
    return new Promise((resolve, reject) => {
        const TarPath = path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/build/release_clang/rethinkdb`);
        gutil.log(`Check ${TarPath} ...`);
        return fs.accessAsync(TarPath, fs.constants.F_OK | fs.constants.R_OK)
            .then(() => {
                return PrepareBinarys(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/build/release_clang/rethinkdb`));
            })
            .then(() => {
                resolve();
            })
            .catch((e) => {
                return fs.accessAsync(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/build/release/rethinkdb`), fs.constants.F_OK | fs.constants.R_OK)
                    .then(() => {
                        return PrepareBinarys();
                    })
                    .then(() => {
                        resolve();
                    })
                    .catch((e) => {
                        BuildLinuxAndMac()
                            .then(() => {
                                return PrepareBinarys(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/build/release/rethinkdb`));
                            })
                            .then(() => {
                                resolve();
                            })
                            .catch((e) => {
                                reject(e);
                            })
                    });
            })
    });
}

function BuildLinuxAndMac() {
    gutil.log(`Ok not found. Build it.`);
    const DownloadPath = path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}.tgz`);
    return new Promise((resolve, reject) => {
        return fs.accessAsync(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}.tgz`), fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK)
            .then(() => {
                resolve();
            })
            .catch(() => {
                gutil.log(`Download rethinkdb version ${RethinkDBVersion}`);
                DoDownload(`rethinkdb-${RethinkDBVersion}`, `https://download.rethinkdb.com/dist/rethinkdb-${RethinkDBVersion}.tgz`, DownloadPath)
                    .then(() => {
                        gutil.log(`Download of rethinkdb version ${RethinkDBVersion} finished!`);
                        resolve(DownloadPath);
                    })
                    .catch((e) => {
                        reject(e);
                    })
            });
    }).then(() => {
        gutil.log(`Unpack ${DownloadPath} ...`);
        return decompress({
            src: DownloadPath,
            dest: path.join(__dirname + '/RethinkDB/')
        });
    })
        .then(() => {
            gutil.log(`Start build process...`);
            const options = ['--allow-fetch', '--fetch', 'openssl', '--config', path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/config.mk`)];
            gutil.log(`Execute: ${path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/configure`)} ${options.join(' ')}`);
            const configure = cp.spawn(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/configure`),
                options,
                {
                    cwd: path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/`)
                }
            );
            configure.child.stdout.on('data', (data) => {
                process.stdout.write(data);
            });
            configure.child.stderr.on('data', (data) => {
                gutil.log(`[Configure] ${data.toString().replace(/\r?\n|\r/g, "")}`);
            });
            return configure;
        })
        .then(() => {
            const options = ['-j', os.cpus().length];
            gutil.log(`Execute: make ${options.join(' ')}`);
            const make = cp.spawn(path.join('make'),
                options,
                {
                    cwd: path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/`)
                }
            );
            make.child.stdout.on('data', (data) => {
                process.stdout.write(data);
            });
            make.child.stderr.on('data', (data) => {
                gutil.log(`[Make] ${data.toString().replace(/\r?\n|\r/g, "")}`);
            });
            return make;
        });
}


function PrepareBinarys(dir) {
    const RDBDest = path.join(__dirname + '/RethinkDB/bin/rethinkdb');
    return new Promise((resolve, reject) => {
        fs.accessAsync(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/build/release_clang/rethinkdb`), fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK)
            .then(() => {
                gutil.log(`Copy binary...`);
                return fs.copyAsync(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/build/release_clang/rethinkdb`), RDBDest, {overwrite: true});
            })
            .then(() => {
                resolve();
            })
            .catch((e) => {
                fs.accessAsync(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/build/release/rethinkdb`), fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK)
                    .then(() => {
                        gutil.log(`Copy binary...`);
                        return fs.copyAsync(path.join(__dirname + `/RethinkDB/rethinkdb-${RethinkDBVersion}/build/release/rethinkdb`), RDBDest, {overwrite: true});
                    })
                    .then(() => {
                        resolve();
                    })
                    .catch((e) => {
                        reject(e);
                    })
            })
    });
}

function DoDownload(Name, url, dest) {
    return new Promise((resolve, reject) => {
        const DLBar = new ProgressBar({
            schema: `${Name} [:bar] :percent eta :timeLeft`
        });
        progress(request(url, {encoding: null}))
            .on('progress', function (state) {
                if (state.percent || state.percent == 0) {
                    DLBar.update(state.percent, {
                        "timeLeft": state.time.remaining || "∞"
                    });
                }
            })
            .on('error', function (e) {
                DLBar.update(0, {
                    "timeLeft": "Error"
                });
                DLBar.clear();
                reject(e);
            })
            .on('end', function () {
                DLBar.update(1, {
                    "timeLeft": "Finished"
                });
                DLBar.clear();
                resolve();
            })
            .pipe(fs.createWriteStream(dest));
    });
}