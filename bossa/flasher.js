import { Uint8Buffer } from './util.js';
export class FlashOffsetError extends Error {
    constructor(msg = undefined) {
        super(msg);
    }
}
export class FileSizeError extends Error {
    constructor(msg = undefined) {
        super(msg);
    }
}
export class Flasher {
    constructor(samba, flash, observer) {
        this._flash = flash;
        this._samba = samba;
        this._observer = observer;
    }
    async erase(foffset) {
        this._observer.onStatus('Erase flash\n');
        await this._flash.eraseAll(foffset);
        this._flash.eraseAuto = false;
    }
    async write(data, foffset) {
        let pageSize = this._flash.pageSize;
        var pageNum = 0;
        var numPages = 0;
        var fsize = data.byteLength;
        let fbytes = 0;
        let remaining = data.byteLength;
        var dataOffset = 0;
        // target address must align with pages
        if (foffset % pageSize != 0 || foffset >= this._flash.totalSize)
            throw new FlashOffsetError();
        numPages = Math.trunc((fsize + pageSize - 1) / pageSize);
        if (numPages > this._flash.numPages)
            throw new FileSizeError();
        this._observer.onStatus('Write ' + fsize + ' bytes to flash (' + numPages + ' pages)\n');
        if (this._samba.canWriteBuffer) {
            var offset = 0;
            let bufferSize = this._samba.writeBufferSize;
            let buffer = new Uint8Buffer(bufferSize);
            while (remaining > 0) {
                let fbytes = (remaining < bufferSize ? remaining : bufferSize);
                buffer.reset();
                buffer.copy(new Uint8Array(data.slice(dataOffset, dataOffset + fbytes)));
                this._observer.onProgress(offset / pageSize, numPages);
                remaining -= fbytes;
                dataOffset += fbytes;
                if (fbytes < bufferSize) {
                    buffer.fill(0, bufferSize - fbytes);
                    fbytes = Math.trunc((fbytes + pageSize - 1) / pageSize) * pageSize;
                }
                await this._flash.loadBuffer(buffer.view(), 0, fbytes);
                await this._flash.writeBuffer(foffset + offset, fbytes);
                offset += fbytes;
            }
        }
        else {
            let buffer = new Uint8Buffer(pageSize);
            let pageOffset = foffset / pageSize;
            while (remaining > 0) {
                let fbytes = (remaining < pageSize ? remaining : pageSize);
                buffer.reset();
                buffer.copy(new Uint8Array(data.slice(dataOffset, dataOffset + fbytes)));
                this._observer.onProgress(pageNum, numPages);
                remaining -= fbytes;
                dataOffset += fbytes;
                if (fbytes < pageSize) {
                    buffer.fill(0, pageSize - fbytes);
                    fbytes = Math.trunc((fbytes + pageSize - 1) / pageSize) * pageSize;
                }
                await this._flash.loadBuffer(buffer.view(), 0, fbytes);
                await this._flash.writePage(pageOffset + pageNum);
                pageNum++;
                if (pageNum == numPages || fbytes != pageSize)
                    break;
            }
        }
        this._observer.onProgress(numPages, numPages);
    }
    async verify(data, foffset) {
        //     uint32_t pageSize = _flash->pageSize();
        //     uint8_t bufferA[pageSize];
        //     uint8_t bufferB[pageSize];
        //     uint32_t pageNum = 0;
        //     uint32_t numPages;
        //     uint32_t pageOffset;
        //     uint32_t byteErrors = 0;
        //     uint16_t flashCrc;
        //     long fsize;
        //     size_t fbytes;
        //     pageErrors = 0;
        //     totalErrors = 0;
        //     if (foffset % pageSize != 0 || foffset >= _flash->totalSize())
        //         throw FlashOffsetError();
        //     pageOffset = foffset / pageSize;
        //     infile = fopen(filename, "rb");
        //     if (!infile)
        //         throw FileOpenError(errno);
        //     try
        //     {
        //         if (fseek(infile, 0, SEEK_END) != 0 || (fsize = ftell(infile)) < 0)
        //             throw FileIoError(errno);
        //         rewind(infile);
        //         numPages = (fsize + pageSize - 1) / pageSize;
        //         if (numPages > _flash->numPages())
        //             throw FileSizeError();
        //         _observer.onStatus("Verify %ld bytes of flash\n", fsize);
        //         while ((fbytes = fread(bufferA, 1, pageSize, infile)) > 0)
        //         {
        //             byteErrors = 0;
        //             _observer.onProgress(pageNum, numPages);
        //             if (_samba.canChecksumBuffer())
        //             {
        //                 uint16_t calcCrc = 0;
        //                 for (uint32_t i = 0; i < fbytes; i++)
        //                     calcCrc = _samba.checksumCalc(bufferA[i], calcCrc);
        //                 flashCrc = _samba.checksumBuffer((pageOffset + pageNum) * pageSize, fbytes);
        //                 if (flashCrc != calcCrc)
        //                 {
        //                     _flash->readPage(pageOffset + pageNum, bufferB);
        //                     for (uint32_t i = 0; i < fbytes; i++)
        //                     {
        //                         if (bufferA[i] != bufferB[i])
        //                             byteErrors++;
        //                     }
        //                 }
        //             }
        //             else
        //             {
        //                 _flash->readPage(pageOffset + pageNum, bufferB);
        //                 for (uint32_t i = 0; i < fbytes; i++)
        //                 {
        //                     if (bufferA[i] != bufferB[i])
        //                         byteErrors++;
        //                 }
        //             }
        //             if (byteErrors != 0)
        //             {
        //                 pageErrors++;
        //                 totalErrors += byteErrors;
        //             }
        //             pageNum++;
        //             if (pageNum == numPages || fbytes != pageSize)
        //                 break;
        //         }
        //     }
        //     catch(...)
        //     {
        //         fclose(infile);
        //         throw;
        //     }
        //     fclose(infile);
        //      _observer.onProgress(numPages, numPages);
        //     if (pageErrors != 0)
        //         return false;
        //     return true;
        // }
    }
}
