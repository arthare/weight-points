"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const i2c_1 = __importDefault(require("i2c"));
const fs_1 = __importDefault(require("fs"));
function assertFail(f, reason) {
    if (!f) {
        throw new Error(reason);
    }
}
var AXIS;
(function (AXIS) {
    AXIS[AXIS["XAXIS"] = 0] = "XAXIS";
    AXIS[AXIS["YAXIS"] = 1] = "YAXIS";
    AXIS[AXIS["ZAXIS"] = 2] = "ZAXIS";
})(AXIS || (AXIS = {}));
const recording = [];
function beginSampling(adxlWire) {
    const tmStart = new Date().getTime();
    function doOneSample() {
        adxlWire.readBytes(0x32, 6, (err, res) => {
            const tmNow = new Date().getTime() - tmStart;
            const convertToGs = 0.004;
            const axes = [];
            for (var axis = AXIS.XAXIS; axis <= AXIS.ZAXIS; axis++) {
                axes.push(res.readInt16LE(axis * 2) * convertToGs);
            }
            recording.push({ ms: tmNow, x: axes[0], y: axes[1], z: axes[2] });
            const seconds = (tmNow) / 1000;
            if (recording.length % 100 === 0) {
                console.log(seconds + ": " + recording.length + " samples");
            }
            setTimeout(doOneSample, 10);
        });
    }
    doOneSample();
}
function startup() {
    return new Promise((resolve) => {
        var address = 0x18;
        var scanWire = new i2c_1.default(address, { device: '/dev/i2c-1' }); // point to your i2c address, debug provides REPL interface
        scanWire.scan(function (err, data) {
            // result contains an array of addresses
            console.log(err, data);
            assertFail(!err, "We shouldn't have had any I2C errors");
            assertFail(data.length === 1, `We should have found exactly one I2C device.  We found ${data.length}`);
            const addressofAdxl = data[0];
            const adxlWire = new i2c_1.default(addressofAdxl, { device: '/dev/i2c-1' });
            adxlWire.writeBytes(0x2D, [8], (err) => {
                assertFail(!err, "Got an error after rate setting: " + JSON.stringify(err));
                // 0x31 values:
                // bits 0 & 1: range  set to 01 (0x1) to get +/- 4g, which seems fine for us
                // bit 2: "justify"   set to 0 to get right-justified
                // bit 3: full_res    set to 1 to get full-res mode
                // bit 4: 0           unused
                // bit 5: int_invert: set to 0 to get interrupts that are active-high
                // bit 6: SPI:        set to 0
                // bit 7: self_test:  set to 0
                const range = 1;
                const justify = 0 << 2;
                const fullRes = 1 << 3;
                adxlWire.writeBytes(0x31, [range | justify | fullRes], (err) => {
                    assertFail(!err, "Got an error after range: " + JSON.stringify(err));
                    // 0x2D values:
                    // bits 0 & 1: wakeup set to 0 (controls sleep behaviour)
                    // bit 2: sleep:      set to 0 to wake up
                    // bit 3: measure:    set to 1 to measure mode
                    // bit 4: AUTO_SLEEP: set to 0 to keep awake
                    // bit 5: link:       set to 0
                    // https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL345.pdf
                    // this should set sampling rate to 100hz
                    adxlWire.writeBytes(0x2C, [1 + 2 + 8], (err) => {
                        assertFail(!err, "Got an error after power setting: " + JSON.stringify(err));
                        resolve(adxlWire);
                    });
                });
            });
        });
    });
}
startup().then((adxl) => {
    beginSampling(adxl);
});
var stdin = process.stdin;
process.on('SIGINT', function () {
    console.log("exiting!");
    const channels = {
        "x-raw": [],
        "y-raw": [],
        "z-raw": [],
        "total-raw": [],
    };
    recording.forEach((sample) => {
        channels['x-raw'].push({ tm: sample.ms, sample: sample.x });
        channels['y-raw'].push({ tm: sample.ms, sample: sample.y });
        channels['z-raw'].push({ tm: sample.ms, sample: sample.z });
        const total = Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z);
        channels['total-raw'].push({ tm: sample.ms, sample: total });
    });
    var lines = [];
    for (var channelName in channels) {
        lines.push(channelName);
        lines.push(channels[channelName].length);
        const rg = channels[channelName];
        rg.forEach((sample) => {
            const tm32768 = (32768 * sample.tm) / 1000;
            lines.push(`${tm32768.toFixed(0)} ${tm32768.toFixed(0)} ${sample.sample.toFixed(3)}`);
        });
    }
    fs_1.default.writeFileSync('./out.signals.out', lines.join('\n'));
    process.exit(0);
});
//# sourceMappingURL=index.js.map