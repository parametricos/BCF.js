import * as fs from "fs/promises";
import { readdirSync } from "fs";

const maximumContentViewPoint = {
  camera_view_point: {
    x: 12.2088897788292,
    y: 52.323145074034,
    z: 5.24072091171001,
  },
  camera_direction: {
    x: -0.381615611200324,
    y: -0.825232810204882,
    z: -0.416365617893758,
  },
  camera_up_vector: {
    x: 0.05857014928797,
    y: 0.126656300502579,
    z: 0.990215996212637,
  },
  field_of_view: 60,
};

function createReaderTest(version) {
  describe(`Read BCF ${version}`, () => {
    it("Read each test-data file", async () => {
      const folderPath = `./test-data/bcf${version}/`;
      try {
        const filesNames = readdirSync(folderPath).filter((name) =>
          name.endsWith(".bcf")
        );

        async function readBcf(fileName) {
          const fullPath = folderPath.concat(fileName);
          const file = await fs.readFile(fullPath);
          const { BcfReader } = await import(`../src/${version}`);
          const reader = new BcfReader();
          await reader.read(file);
          //console.log('description', reader.markups[0].topic.description)
          expect(reader.markups[0].topic.title).toBeDefined();
        }

        for (const file of filesNames) {
          await readBcf(file);
        }
      } catch (err) {
        console.log("err", err);
        expect(false).toBe(true);
      }
      expect(true).toBe(true);
    });

    let file;
    let reader;

    beforeAll(async () => {
      file = await fs.readFile(
        `./test-data/bcf${version}/MaximumInformation.bcf`
      );
      const { BcfReader } = await import(`../src/${version}`);
      reader = new BcfReader();
      await reader.read(file);
    });

    it("BCF is not null", () => {
      expect(reader.markups.length).toBeGreaterThan(0);
    });

    it("Markup Topic Title is Defined", () => {
      expect(reader.markups[1].topic.title).toBe("Maximum Content");
    });

    it("Maximum Content Viewpoint", () => {
      expect(reader.markups[1].viewpoints[0].perspective_camera).toStrictEqual(
        maximumContentViewPoint
      );
    });
    it("Read snapshot", async () => {
      const snapshot = await reader.markups[1].viewpoints[0].getSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot.length).toBeGreaterThan(0);
    });
  });
}

createReaderTest("2.1");
createReaderTest("3.0");
