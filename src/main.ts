import { App, Plugin, TFile, TFolder, PluginSettingTab, Setting, Menu, MenuItem } from 'obsidian';

import { AdocNewFileModal } from './adocNewFileModal';
import { AsciidocView, ASCIIDOC_EDITOR_VIEW } from './asciidocView';
import { around } from 'monkey-around';
import { adocFindDocumentRefs, fileRecurseChildrenCb, myRealpath, DocRef } from "./util";

let adocExtensions = ["adoc", "asciidoc"];

class FileCacheEntry {
  size: number;
  mtime: number;
  hash: string;

  public constructor(file: TFile, hash: string) {
    this.mtime = Math.round(file.stat.mtime);
    this.hash = hash;
    this.size = file.stat.size;
  }
}

class MetadataCacheEntry {
  embeds: any[];
  sections: any[];
  links: DocRef[];
  v: number;

  public constructor(file: TFile, refs: DocRef[], v: number) {
    this.embeds = [];
    this.sections = [];
    this.links = refs;
    this.v = v;
  }
}


export default class AsciidocPlugin extends Plugin {
  hooksUnregLst: any[];
  
  async onload() {
    this.hooksUnregLst = []

    this.registerExtensions(adocExtensions, ASCIIDOC_EDITOR_VIEW);
    this.registerView(ASCIIDOC_EDITOR_VIEW, (leaf) => new AsciidocView(this, leaf));

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TFile) => {
        menu.addItem((item: MenuItem) => {
          item
          .setTitle("New asciidoc file")
          .setIcon("scroll-text")
          .onClick(async () => {
            new AdocNewFileModal(this, file).open();
          });
        });
      })
    );

    this.addRibbonIcon('scroll-text', "New asciidoc file", () => {
        new AdocNewFileModal(this).open();
      });
    this.addCommand({
      id: 'create-adoc',
      name: 'create new Asciidoc file',
      callback: () => {
          new AdocNewFileModal(this).open();
      }
    });
    let plugin = this;
    let metadataCache: any = this.app.metadataCache
    let uninstaller = around(metadataCache, {
      computeFileMetadataAsync(oldMethod: any) {
        return async function (...args : any[]) {
          //console.log("intercept computeFileMetadataAsync");
          let argTgtFile: TFile|null = args[0];
          const orig = () => {
            return oldMethod && oldMethod.apply(this, args);
          }
          if (argTgtFile === null || !adocExtensions.includes(argTgtFile.extension))
            return orig();

          let s = await plugin.app.vault.cachedRead(argTgtFile);
          const refs = adocFindDocumentRefs(s);
          console.log(`refs = ${refs}`);
          if (refs.length < 1)
            return;

          const buf = new TextEncoder().encode(s);
          const binhash = await crypto.subtle.digest("SHA-256", buf);
          let hash = Buffer.from(binhash).toString('hex');
          let ver = 0;

          let currentCacheEntry = metadataCache.fileCache[argTgtFile.path];
          if (currentCacheEntry !== undefined && currentCacheEntry.hash != '') {
            if (hash == currentCacheEntry.hash)
              return;
            //console.log(currentCacheEntry);
            //console.log(metadataCache.metadataCache[currentCacheEntry.hash]);
            if (metadataCache.metadataCache[currentCacheEntry.hash] !== undefined)
              ver = metadataCache.metadataCache[currentCacheEntry.hash].v;
          }
          if (ver === undefined)
            ver = 0;
          metadataCache.fileCache[argTgtFile.path] = new FileCacheEntry(argTgtFile, hash);
          metadataCache.metadataCache[hash] = new MetadataCacheEntry(argTgtFile, refs, ver + 1);
          //metadataCache.getFirstLinkpathDest()
          metadataCache.resolvedLinks[argTgtFile.path] = {}
          refs.forEach((v: DocRef) => {
            const path = myRealpath(v.link);
            metadataCache.resolvedLinks[argTgtFile!.path][path] = 1;
          });
          metadataCache.unresolvedLinks[argTgtFile.path] = {'link.md' : 1}
          //console.log("REFS!", refs);
          metadataCache.trigger("resolve", argTgtFile);
          //metadataCache.trigger("changed", argTgtFile, s, metadataCache.metadataCache[hash]);
        }
      }
    });
    this.hooksUnregLst.push(uninstaller);

    let vault: any = this.app.vault;
    uninstaller = around(vault, {
      getMarkdownFiles(oldMethod: any) {
        return function (...args : any[]) {
          const orig = () => {
            return oldMethod && oldMethod.apply(this, args);
          }
          console.log("GetMarkdownFiles")
          let n: TFolder = vault.getRoot();
          let e: TFile[] = [];
          fileRecurseChildrenCb(n, (t) => {
            if (t instanceof TFile && ["adoc", "asciidoc", "md"].includes(t.extension))
              e.push(t);
          });
          return e;
        }
      }
    });

  }

  onunload() {
    this.hooksUnregLst.forEach((v) => {
      v();

    });
    this.hooksUnregLst = [];
  }


  public updateEditorExtensions() {
    this.app.workspace.updateOptions();
  }
}

