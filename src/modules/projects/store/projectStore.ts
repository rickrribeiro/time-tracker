import { create } from 'zustand'
import { Project, ProjectCycle, ProjectMilestone, ProjectOverview, ProjectPatch, ProjectStatus, ProjectStatusPayload } from '../../../types'
import { useTaskStore } from '../../timetracker/store/taskStore'
import { useTagStore } from '../../timetracker/store/tagStore'

interface ProjectState {
  projects: Project[]
  overview: Record<number, ProjectOverview>
  milestones: ProjectMilestone[]
  cycles: ProjectCycle[]
  loadingOverview: boolean
  refresh: () => Promise<void>
  refreshAll: () => Promise<void>
  refreshOverview: () => Promise<void>
  refreshMilestones: () => Promise<void>
  refreshCycles: () => Promise<void>
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
  ) => Promise<Project>
  update: (project: Project) => Promise<void>
  patch: (id: number, fields: ProjectPatch) => Promise<Project>
  setStatus: (id: number, status: ProjectStatus, payload?: ProjectStatusPayload) => Promise<void>
  completeNextAction: (id: number, next: string | null) => Promise<void>
  setStage: (id: number, stage: string) => Promise<void>
  remove: (id: number) => Promise<void>
  /** "Trabalhar nisso": inicia o timer vinculado ao projeto. */
  startWorking: (project: Project, title?: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  overview: {},
  milestones: [],
  cycles: [],
  loadingOverview: false,

  refresh: async () => {
    const projects = await window.api.projects.getAll()
    set({ projects })
  },

  refreshAll: async () => {
    await Promise.all([get().refresh(), get().refreshMilestones(), get().refreshCycles(), get().refreshOverview()])
  },

  refreshOverview: async () => {
    set({ loadingOverview: true })
    try {
      const list = await window.api.projects.overview()
      const overview: Record<number, ProjectOverview> = {}
      for (const o of list) overview[o.projectId] = o
      set({ overview })
    } finally {
      set({ loadingOverview: false })
    }
  },

  refreshMilestones: async () => set({ milestones: await window.api.milestones.getAll() }),
  refreshCycles: async () => set({ cycles: await window.api.cycles.getAll() }),

  create: async (name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience) => {
    const p = await window.api.projects.create(name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience)
    await get().refresh()
    void get().refreshOverview()
    return p
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

  patch: async (id, fields) => {
    // otimista: a UI reflete na hora
    set({ projects: get().projects.map((p) => (p.id === id ? ({ ...p, ...fields } as Project) : p)) })
    const p = await window.api.projects.patch(id, fields)
    set({ projects: get().projects.map((x) => (x.id === id ? p : x)) })
    void get().refreshOverview()
    return p
  },

  setStatus: async (id, status, payload) => {
    const p = await window.api.projects.setStatus(id, status, payload)
    set({ projects: get().projects.map((x) => (x.id === id ? p : x)) })
    void get().refreshOverview()
  },

  completeNextAction: async (id, next) => {
    const p = await window.api.projects.completeNextAction(id, next)
    set({ projects: get().projects.map((x) => (x.id === id ? p : x)) })
    void get().refreshOverview()
  },

  setStage: async (id, stage) => {
    set({ projects: get().projects.map((p) => (p.id === id ? { ...p, stage } : p)) })
    await window.api.projects.setStage(id, stage)
    await get().refresh()
  },

  remove: async (id) => {
    await window.api.projects.delete(id)
    await get().refresh()
  },

  startWorking: async (project, title) => {
    let tags = useTagStore.getState().tags
    if (!tags.length) {
      await useTagStore.getState().refreshTags()
      tags = useTagStore.getState().tags
    }
    // tag vinculado ao projeto > "Work" (id 2) > nenhum
    const tag = tags.find((t) => t.projectId === project.id) ?? tags.find((t) => t.id === 2) ?? null
    await useTaskStore.getState().startTask(title?.trim() || project.nextAction || project.name, tag?.id ?? null, null, null, project.id)
    void get().refreshOverview()
  }
}))
