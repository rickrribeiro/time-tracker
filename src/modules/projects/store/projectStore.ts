import { create } from 'zustand'
import { Project } from '../../../types'

interface ProjectState {
  projects: Project[]
  refresh: () => Promise<void>
  create: (
    name: string,
    description: string | null,
    githubRepoUrl: string | null,
    color: string,
    claudeCommand: string | null,
    localPath: string | null,
    stage: string,
    businessModel: string | null,
    pricing: string | null,
    audience: string | null
  ) => Promise<void>
  update: (project: Project) => Promise<void>
  setStage: (id: number, stage: string) => Promise<void>
  remove: (id: number) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],

  refresh: async () => {
    const projects = await window.api.projects.getAll()
    set({ projects })
  },

  create: async (name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience) => {
    await window.api.projects.create(name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience)
    await get().refresh()
  },

  update: async (project) => {
    await window.api.projects.update(
      project.id,
      project.name,
      project.description,
      project.githubRepoUrl,
      project.color,
      project.archived,
      project.claudeCommand,
      project.localPath,
      project.stage,
      project.businessModel,
      project.pricing,
      project.audience
    )
    await get().refresh()
  },

  setStage: async (id, stage) => {
    // optimistic
    set({ projects: get().projects.map((p) => (p.id === id ? { ...p, stage } : p)) })
    await window.api.projects.setStage(id, stage)
    await get().refresh()
  },

  remove: async (id) => {
    await window.api.projects.delete(id)
    await get().refresh()
  }
}))
