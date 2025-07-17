import {
  IViewPoint,
  ITopic,
  VisualizationInfo,
  IHeader,
  IMarkup,
} from "./schema";
import { IHelpers } from "./IHelpers";
import { unzipSync, Unzipped } from "fflate";
import { IExtensionsSchema, IProject } from "./schema/project";
import { XMLParser } from "fast-xml-parser";

export default class BcfReader {
  version: string;
  bcf_archive: Unzipped | undefined;
  project: IProject | undefined;
  markups: Markup[] = [];
  helpers: IHelpers;

  constructor(version: string, helpers: IHelpers) {
    this.version = version;
    this.helpers = helpers;
  }

  read = async (src: string | ArrayBuffer | Uint8Array | Blob) => {
    try {
      const markups: string[] = [];

      // Convert different input types to Uint8Array for fflate
      let data: Uint8Array;
      if (src instanceof ArrayBuffer) {
        data = new Uint8Array(src);
      } else if (src instanceof Uint8Array) {
        data = src;
      } else if (src instanceof Blob) {
        const arrayBuffer = await src.arrayBuffer();
        data = new Uint8Array(arrayBuffer);
      } else if (typeof src === "string") {
        // If it's a string, assume it's a base64 or URL - convert appropriately
        // For now, we'll throw an error as string URLs need different handling
        throw new Error(
          "String URLs not supported in fflate version. Please provide ArrayBuffer, Uint8Array, or Blob."
        );
      } else {
        throw new Error("Unsupported input type for fflate");
      }

      this.bcf_archive = unzipSync(data);

      let projectId: string = "";
      let projectName: string = "";
      let projectVersion: string = "";
      let extension_schema: IExtensionsSchema | undefined = undefined;

      for (const [name, fileData] of Object.entries(this.bcf_archive)) {
        const data = fileData as Uint8Array;

        if (name.endsWith(".bcf")) {
          markups.push(name);
        } else if (name.endsWith(".version")) {
          const text = new TextDecoder().decode(data);
          const parsedEntry = new XMLParser(
            this.helpers.XmlParserOptions
          ).parse(text);
          projectVersion = parsedEntry.Version.DetailedVersion;
        } else if (name.endsWith(".bcfp")) {
          const text = new TextDecoder().decode(data);
          const parsedEntry = new XMLParser(
            this.helpers.XmlParserOptions
          ).parse(text);

          if (
            !parsedEntry.ProjectExtension ||
            !parsedEntry.ProjectExtension.Project
          )
            continue; //NOTE: Throw an error here?

          projectId = parsedEntry.ProjectExtension.Project["@_ProjectId"] || ""; //NOTE: Throw an error here?
          projectName = parsedEntry.ProjectExtension.Project.Name || "";
        } else if (name.endsWith("extensions.xsd")) {
          const text = new TextDecoder().decode(data);
          const parsedEntry = new XMLParser(
            this.helpers.XmlParserOptions
          ).parse(text);
          extension_schema = this.helpers.XmlToJsonNotation(parsedEntry);
        }
      }

      const purged_markups: IMarkup[] = [];

      for (let i = 0; i < markups.length; i++) {
        const markupName = markups[i];
        const markup = new Markup(this, markupName);
        await markup.read();
        this.markups.push(markup);

        const purged_markup = {
          header: markup.header,
          topic: markup.topic,
          project: this.project,
          viewpoints: markup.viewpoints,
        } as IMarkup;
        purged_markups.push(purged_markup);
      }

      this.project = {
        project_id: projectId,
        name: projectName,
        version: projectVersion,
        markups: undefined,
        reader: this,
        extension_schema: extension_schema,
      };

      this.project.markups = purged_markups.map((mkp) => {
        return { ...mkp, project: this.project } as IMarkup;
      });
    } catch (e) {
      console.log("Error in loading BCF archive. The error below was thrown.");
      console.error(e);
    }
  };

  getEntry = (name: string): Uint8Array | undefined => {
    return this.bcf_archive?.[name];
  };
}

export class Markup {
  readonly reader: BcfReader;
  readonly markup_name: string;

  header: IHeader | undefined;
  topic: ITopic | undefined;
  viewpoints: VisualizationInfo[] = [];

  constructor(reader: BcfReader, markupName: string) {
    this.reader = reader;
    this.markup_name = markupName;
  }

  read = async () => {
    await this.parseMarkup();
    await this.parseViewpoints();
  };

  private parseMarkup = async () => {
    const fileData = this.reader.getEntry(this.markup_name);
    if (!fileData) throw new Error("Missing markup file");

    const text = new TextDecoder().decode(fileData);
    const markup = this.reader.helpers.GetMarkup(text);
    this.topic = markup.topic;
    this.header = markup.header;
  };

  private parseViewpoints = async () => {
    if (!this.topic) return;

    if (this.topic.viewpoints) {
      const topic_viewpoints = this.topic.viewpoints;

      for (let i = 0; i < topic_viewpoints.length; i++) {
        const entry = topic_viewpoints[i];
        const key = this.topic.guid + "/" + entry.viewpoint;
        const fileData = this.reader.getEntry(key);

        if (!fileData) throw new Error("Missing Visualization Info");

        const text = new TextDecoder().decode(fileData);
        const viewpoint = this.reader.helpers.GetViewpoint(text);
        viewpoint.snapshot = entry.snapshot;
        viewpoint.getSnapshot = async () => {
          if (entry.snapshot) return await this.getSnapshot(entry.snapshot);
        };

        this.viewpoints.push(viewpoint);
      }
    }
  };

  /**
   * Parses the png snapshot.
   *
   * @returns {string} The image in base64String format.
   *
   * @deprecated This function is deprecated and will be removed in the next version.<br>
   * Please use viewpoint.getSnapshot() instead.<br>
   *
   */
  getViewpointSnapshot = async (
    viewpoint: VisualizationInfo | IViewPoint
  ): Promise<string | undefined> => {
    if (!viewpoint || !this.topic) return;
    const fileData = this.reader.getEntry(
      `${this.topic.guid}/${viewpoint.snapshot}`
    );
    if (fileData) {
      return btoa(String.fromCharCode.apply(null, Array.from(fileData)));
    }
  };

  /**
   * Parses the png snapshot.
   *
   * @returns {string} The image in base64String format.
   */
  getSnapshot = async (guid: string): Promise<string | undefined> => {
    if (!guid || !this.topic) return;
    const fileData = this.reader.getEntry(`${this.topic.guid}/${guid}`);
    if (fileData) {
      return btoa(String.fromCharCode.apply(null, Array.from(fileData)));
    }
  };
}
