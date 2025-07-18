import * as fs from "fs/promises"
import { existsSync, mkdirSync } from "fs"
import { randomBytes } from "crypto"

function createWriterTest(version) {
    describe(`Write BCF ${version}`, () => {
        let BcfWriter, BcfReader

        beforeAll(async () => {
            const module = await import(`../src/${version}`)
            BcfWriter = module.BcfWriter
            BcfReader = module.BcfReader
        })

        afterAll(async () => {
            // Clean up test output directory
            try {
                const outputDir = `./test-data/bcf${version}/output`
                if (existsSync(outputDir)) {
                    const files = await fs.readdir(outputDir)
                    for (const file of files) {
                        await fs.unlink(`${outputDir}/${file}`)
                    }
                    await fs.rmdir(outputDir)
                }
            } catch (err) {
                // Ignore cleanup errors
            }
        })

        it("Create new BCF with minimal project data", async () => {
            const writer = new BcfWriter()
            const projectId = randomBytes(16).toString('hex')
            
            const project = {
                project_id: projectId,
                name: "Test Project - Minimal",
                version: version,
                markups: []
            }

            const buffer = await writer.write(project)
            expect(buffer).toBeDefined()
            expect(buffer.length).toBeGreaterThan(0)
        })

        it("Create BCF with single topic", async () => {
            const writer = new BcfWriter()
            const projectId = randomBytes(16).toString('hex')
            const topicGuid = randomBytes(16).toString('hex')

            const topic = {
                guid: topicGuid,
                topic_type: "Issue",
                topic_status: "Open", 
                title: "Test Issue",
                description: "This is a test issue created by BCF.js tests",
                creation_author: "BCF.js Test Suite",
                creation_date: new Date().toISOString()
            }

            const markup = {
                topic: topic,
                viewpoints: []
            }

            const project = {
                project_id: projectId,
                name: "Test Project - Single Topic",
                version: version,
                markups: [markup]
            }

            const buffer = await writer.write(project)
            expect(buffer).toBeDefined()
            expect(buffer.length).toBeGreaterThan(0)

            // Verify we can read back the written data
            const reader = new BcfReader()
            await reader.read(buffer)
            expect(reader.project.name).toBe("Test Project - Single Topic")
            expect(reader.project.markups.length).toBe(1)
            expect(reader.project.markups[0].topic.title).toBe("Test Issue")
        })

        it("Create BCF with multiple topics", async () => {
            const writer = new BcfWriter()
            const projectId = randomBytes(16).toString('hex')

            const topics = [
                {
                    guid: randomBytes(16).toString('hex'),
                    topic_type: "Issue",
                    topic_status: "Open",
                    title: "First Test Issue",
                    description: "First test issue description",
                    creation_author: "Test Author",
                    creation_date: new Date().toISOString()
                },
                {
                    guid: randomBytes(16).toString('hex'),
                    topic_type: "Request",
                    topic_status: "Closed",
                    title: "Second Test Issue", 
                    description: "Second test issue description",
                    creation_author: "Test Author",
                    creation_date: new Date().toISOString()
                }
            ]

            const markups = topics.map(topic => ({
                topic: topic,
                viewpoints: []
            }))

            const project = {
                project_id: projectId,
                name: "Test Project - Multiple Topics",
                version: version,
                markups: markups
            }

            const buffer = await writer.write(project)
            expect(buffer).toBeDefined()
            expect(buffer.length).toBeGreaterThan(0)

            // Verify we can read back the written data
            const reader = new BcfReader()
            await reader.read(buffer)
            expect(reader.project.markups.length).toBe(2)
            expect(reader.project.markups[0].topic.title).toBe("First Test Issue")
            expect(reader.project.markups[1].topic.title).toBe("Second Test Issue")
        })

        it("Write BCF to file and verify file exists", async () => {
            const writer = new BcfWriter()
            const projectId = randomBytes(16).toString('hex')
            
            const project = {
                project_id: projectId,
                name: "File Write Test",
                version: version,
                markups: []
            }

            const buffer = await writer.write(project)
            
            // Ensure output directory exists
            const outputDir = `./test-data/bcf${version}/output`
            if (!existsSync(outputDir)) {
                mkdirSync(outputDir, { recursive: true })
            }

            const filePath = `${outputDir}/write-test.bcf`
            await fs.writeFile(filePath, buffer)
            
            expect(existsSync(filePath)).toBe(true)
            
            // Verify file can be read back
            const fileBuffer = await fs.readFile(filePath)
            const reader = new BcfReader()
            await reader.read(fileBuffer)
            expect(reader.project.name).toBe("File Write Test")
        })
    })
}

createWriterTest('2.1')
createWriterTest('3.0') 