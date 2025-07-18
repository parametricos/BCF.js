import { zip } from "fflate";
import { IProject } from "./schema";
import { IHelpers } from "./IHelpers";
import { XMLBuilder } from "fast-xml-parser";

export default class BcfWriter {
  version: string;
  project?: IProject;
  markups: any[] = [];
  files: any[];
  helpers: IHelpers;

  constructor(version: string, helpers: IHelpers) {
    this.version = version;
    this.helpers = helpers;
    this.files = [];
  }

  addEntry = (file: IFile) => {
    if (file.path.endsWith(".version")) return;

    this.files.push(file);
  };

  write = async (project: IProject): Promise<Buffer | undefined> => {
    try {
      this.project = project;
      createEntries(this, project.markups);
      return await exportZip(this.files);
    } catch (e) {
      console.log("Error in writing BCF archive. The error below was thrown.");
      console.error(e);
    }
  };
}

function createEntries(writer: BcfWriter, markups: any) {
  if (!writer.project) return;

  writer.addEntry(bcfversion(writer.version));
  writer.addEntry(projectbcfp(writer.project.project_id, writer.project.name));
  writer.addEntry(extensionssxd(writer));

  for (const markup of markups) {
    const formattedMarkup = writer.helpers.MarkupToXmlNotation(markup);
    writer.markups.push(formattedMarkup);
    let xml = new XMLBuilder(writer.helpers.XmlBuilderOptions).build(
      formattedMarkup
    );
    xml = `<?xml version="1.0" encoding="utf-8"?>${xml}`;

    if (markup.topic) {
      const guid = markup.topic.guid;
      const newEntry = {
        path: `${guid}/markup.bcf`,
        content: xml,
      };
      writer.addEntry(newEntry);
    }
  }
}

async function exportZip(files: IFile[]): Promise<Buffer> {
  const fileMap: { [path: string]: Uint8Array } = {};

  for (const file of files) {
    // Convert string content to Uint8Array for fflate
    fileMap[file.path] = new TextEncoder().encode(file.content);
  }

  return new Promise((resolve, reject) => {
    zip(fileMap, (err: Error | null, data: Uint8Array) => {
      if (err) {
        reject(err);
      } else {
        resolve(Buffer.from(data));
      }
    });
  });
}

function bcfversion(version: string): IFile {
  return {
    path: "bcf.version",
    content: `<?xml version="1.0" encoding="utf-8"?>
        <Version xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:xsd="http://www.w3.org/2001/XMLSchema" VersionId="${version}">
      <DetailedVersion>${version}</DetailedVersion>
    </Version>`,
  };
}

function projectbcfp(projectId: string, projectName: string): IFile {
  return {
    path: "project.bcfp",
    content: `<?xml version="1.0" encoding="utf-8"?>
<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Project ProjectId="${projectId}">
    <Name>${projectName}</Name>
  </Project>
  <ExtensionSchema>extensions.xsd</ExtensionSchema>
</ProjectExtension>`,
  };
}

function extensionssxd(writer: BcfWriter): IFile {
  const attributes = [
    "version",
    "encoding",
    "standalone",
    "xmlns",
    "schemaLocation",
    "name",
    "base",
    "value",
  ];

  const options = {
    additional_attributes: attributes,
    firstletter_uppercase: false,
    plural_to_singular: false,
  };

  let helpers = writer.helpers;

  if (writer.version == "3.0") {
    const v21 = require("./2.1/index");
    const helpersV21: BcfWriter = new v21.BcfWriter();
    helpers = helpersV21.helpers;
  }

  const formattedXml: any = helpers.RenameJsonKeys(
    writer.project?.extension_schema,
    options
  );

  let xml = new XMLBuilder(helpers.XmlBuilderOptions).build(formattedXml);

  return {
    path: "extensions.xsd",
    content: xml,
  };
}

interface IFile {
  path: string;
  content: string;
}
