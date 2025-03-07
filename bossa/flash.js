import { WordCopyApplet } from './wordcopyapplet.js';
export class FlashConfigError extends Error {
    constructor(msg = undefined) {
        super(msg);
    }
}
export class FlashRegionError extends Error {
    constructor(msg = undefined) {
        super(msg);
    }
}
export class FlashEraseError extends Error {
    constructor(msg = undefined) {
        super(msg);
    }
}
export class FlashCmdError extends Error {
    constructor(msg = undefined) {
        super(msg);
    }
}
export class FlashPageError extends Error {
    constructor(msg = undefined) {
        super(msg);
    }
}
class FlashOption {
    constructor(value) {
        this._dirty = false;
        this._value = value;
    }
    set(value) {
        this._value = value;
        this._dirty = true;
    }
    get() {
        return this._value;
    }
    isDirty() { return this._dirty; }
}
;
/**
 *
 */
export class Flash {
    /**
     * Create a flasher
     *
     * @param samba SamBA instance handling IO with board
     * @param name Name of the board
     * @param addr Flash base address
     * @param pages Number of pages
     * @param size Page size in bytes
     * @param planes Number of flash planes
     * @param lockRegions Number of flash lock regions
     * @param user Address in SRAM where the applet and buffers will be placed
     * @param stack Address in SRAM where the applet stack will be placed
     */
    constructor(samba, name, addr, pages, size, planes, lockRegions, user, stack) {
        this._prepared = false;
        this._onBufferA = true;
        this._pageBufferA = 0;
        this._pageBufferB = 0;
        this._samba = samba;
        this._name = name;
        this._addr = addr;
        this._pages = pages;
        this._size = size;
        this._planes = planes;
        this._lockRegions = lockRegions;
        this._user = user;
        this._stack = stack;
        this._bootFlash = new FlashOption(true);
        this._bod = new FlashOption(true);
        this._bor = new FlashOption(true);
        this._security = new FlashOption(true);
        this._regions = new FlashOption(new Array(0));
        this._wordCopy = new WordCopyApplet(samba, user);
        if (!((size & (size - 1)) == 0)) {
            throw new FlashConfigError();
        }
        if (!((pages & (pages - 1)) == 0)) {
            throw new FlashConfigError();
        }
        if (!((lockRegions & (lockRegions - 1)) == 0)) {
            throw new FlashConfigError();
        }
        this._onBufferA = true;
        // page buffers will have the size of a physical page and will be situated right after the applet
        this._pageBufferA = Math.trunc((this._user + this._wordCopy.size + 3) / 4) * 4; // we need to avoid non 32bits aligned access on Cortex-M0+
        this._pageBufferB = this._pageBufferA + size;
    }
    get address() { return this._addr; }
    get pageSize() { return this._size; }
    get numPages() { return this._pages; }
    get numPlanes() { return this._planes; }
    get totalSize() { return this._size * this._pages; }
    get lockRegions() { return this._lockRegions; }
    setLockRegions(regions) {
        if (regions.length > this._lockRegions)
            throw new FlashRegionError();
        this._regions.set(regions);
    }
    setSecurity() {
        this._security.set(true);
    }
    setBod(enable) {
        if (this.canBod())
            this._bod.set(enable);
    }
    setBor(enable) {
        if (this.canBor())
            this._bor.set(enable);
    }
    setBootFlash(enable) {
        if (this.canBootFlash())
            this._bootFlash.set(enable);
    }
    async writeBuffer(dst_addr, size) {
        await this._samba.writeBuffer(this._onBufferA ? this._pageBufferA : this._pageBufferB, dst_addr + this._addr, size);
    }
    async loadBuffer(data, offset = 0, bufferSize = data.length) {
        if (offset > 0) {
            data = data.subarray(offset);
        }
        await this._samba.write(this._onBufferA ? this._pageBufferA : this._pageBufferB, data, bufferSize);
    }
    async prepareApplet() {
        if (!this._prepared) {
            await this._wordCopy.setWords(this._size / 4 /* sizeof(uint32_t) */);
            await this._wordCopy.setStack(this._stack);
            this._prepared = true;
        }
    }
}
