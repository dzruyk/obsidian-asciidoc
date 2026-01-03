import { App, Plugin, TFile, TFolder, PluginSettingTab, Setting, Menu, MenuItem } from 'obsidian';

import { AdocNewFileModal } from './adocNewFileModal';
import { AsciidocView, ASCIIDOC_EDITOR_VIEW } from './asciidocView';
import { around } from 'monkey-around';
import { adocFindDocumentRefs, filesRecursePassCb, myRealpath, DocRef } from "./util";

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

interface AsciidocPluginSettings {
  experimentalMetadataCacheHook: boolean;
  vimMode: boolean;
}

const DEFAULT_SETTINGS: AsciidocPluginSettings = {
  experimentalMetadataCacheHook: false,
  vimMode: false
}

export default class AsciidocPlugin extends Plugin {
  settings: AsciidocPluginSettings;
  hooksUnregLst: any[];
  
  async onload() {
    this.hooksUnregLst = []
    await this.loadSettings();
    this.addSettingTab(new AsciidocPluginSettingTab(this.app, this));

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
    if (this.settings.experimentalMetadataCacheHook) {
      this.applyExperimentalHooks();
    }
  }

  // still requires reload!
  applyExperimentalHooks() {
    // Lets hook metadataCache
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
          //console.log(`refs = ${refs}`);
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
  }
  unregHooks() {
    this.hooksUnregLst.forEach((v) => {
      v();
    });
    this.hooksUnregLst = [];
  }

  onunload() {
    //this.unregHooks();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  public updateEditorExtensions() {
    this.app.workspace.getLeavesOfType(ASCIIDOC_EDITOR_VIEW).forEach(leaf => {
      const view = leaf.view as AsciidocView;
      if (view && view.updateVimMode) {
        view.updateVimMode(this.settings.vimMode);
      }
    });
  }
}

class AsciidocPluginSettingTab extends PluginSettingTab {
  plugin: AsciidocPlugin;
  constructor(app: App, plugin: AsciidocPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const {containerEl} = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Enable experimental features")
      .setDesc("Integrate asciidoc with links/backlinks/graph (still WIP). Requires app reload")
      .addToggle(c => c
        .setValue(this.plugin.settings.experimentalMetadataCacheHook)
        .onChange(async (value) => {
          this.plugin.settings.experimentalMetadataCacheHook = value;
          await this.plugin.saveSettings();
          if (value) {
            this.plugin.applyExperimentalHooks();
            let metadataCache: any = this.app.metadataCache
            metadataCache.clear();
          } else {
            this.plugin.unregHooks();
          }
        })
      )

    new Setting(containerEl)
      .setName("Enable Vim mode")
      .setDesc("Enable Vim keybindings in the editor (Edit mode only)")
      .addToggle(c => c
        .setValue(this.plugin.settings.vimMode)
        .onChange(async (value) => {
          this.plugin.settings.vimMode = value;
          await this.plugin.saveSettings();
          this.plugin.updateEditorExtensions();
        })
      )
  }
}

