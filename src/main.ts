import { App, Plugin, TFile, PluginSettingTab, Setting, Menu, MenuItem } from 'obsidian';

import { AdocNewFileModal } from './adocNewFileModal';
import { AsciidocView, ASCIIDOC_EDITOR_VIEW } from './asciidocView';

interface AsciidocPluginSettings {
  krokiEnabled: boolean;
  krokiUrl: string;
};

const DEFAULT_SETTINGS: AsciidocPluginSettings =  {
  krokiEnabled: false,
  krokiUrl: 'https://kroki.io/',
}

export default class AsciidocPlugin extends Plugin {
  public settings: AsciidocPluginSettings;

  async onload() {
    await this.loadSettings();
    this.settings = Object.assign(DEFAULT_SETTINGS, (await this.loadData()) ?? {});
    this.registerExtensions(["adoc", "asciidoc"], ASCIIDOC_EDITOR_VIEW);
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
    this.addSettingTab(new AsciidocSettingTab(this.app, this));
  }

  public updateEditorExtensions() {
    this.app.workspace.updateOptions();
  }
  async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class AsciidocSettingTab extends PluginSettingTab {
	plugin: AsciidocPlugin;

	constructor(app: App, plugin: AsciidocPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable kroki diagrams')
			.setDesc('If enabled, process diagrams with Kroki (may require internet access)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.krokiEnabled)
				.onChange(async (value) => {
					this.plugin.settings.krokiEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('kroki URL')
			.setDesc('url to kroki site')
			.addText(text => text
				.setValue(this.plugin.settings.krokiUrl)
				.onChange(async (value) => {
					this.plugin.settings.krokiUrl = value;
					await this.plugin.saveSettings();
				}));
	}
}
