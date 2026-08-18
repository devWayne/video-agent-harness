import type { ProductionProject } from "../domain/production-project.js";

export interface ProductionProjectRepository {
  saveProject(project: ProductionProject): Promise<void>;
  findProjectById(id: string): Promise<ProductionProject | undefined>;
  listProjects(): Promise<ProductionProject[]>;
}
