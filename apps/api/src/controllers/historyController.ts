import type { Request, Response } from "express";
import { z } from "zod";
import {
  listReportHistory,
  getReportHistoryDetail,
  renameReportHistory,
  removeReportHistory,
  duplicateReportHistory,
} from "../services/historyService.js";

const renameSchema = z.object({
  title: z.string().min(1),
});

export async function getHistoryListController(req: Request, res: Response) {
  try {
    const userId = req.currentUser?.id;
    if (!userId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    const history = await listReportHistory(userId);
    res.json({ data: history });
  } catch (error) {
    res.status(500).json({ error: { message: error instanceof Error ? error.message : "Internal Server Error" } });
  }
}

export async function getHistoryDetailController(req: Request, res: Response) {
  try {
    const userId = req.currentUser?.id;
    const { id } = req.params;
    if (!userId || !id) {
      return res.status(401).json({ error: { message: "Unauthorized or missing ID" } });
    }
    const detail = await getReportHistoryDetail(id, userId);
    res.json({ data: detail });
  } catch (error) {
    res.status(404).json({ error: { message: error instanceof Error ? error.message : "Not Found" } });
  }
}

export async function renameHistoryController(req: Request, res: Response) {
  try {
    const userId = req.currentUser?.id;
    const { id } = req.params;
    if (!userId || !id) {
      return res.status(401).json({ error: { message: "Unauthorized or missing ID" } });
    }
    
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Invalid request body" } });
    }
    
    const result = await renameReportHistory(id, userId, parsed.data.title);
    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ error: { message: error instanceof Error ? error.message : "Internal Server Error" } });
  }
}

export async function deleteHistoryController(req: Request, res: Response) {
  try {
    const userId = req.currentUser?.id;
    const { id } = req.params;
    if (!userId || !id) {
      return res.status(401).json({ error: { message: "Unauthorized or missing ID" } });
    }
    const result = await removeReportHistory(id, userId);
    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ error: { message: error instanceof Error ? error.message : "Internal Server Error" } });
  }
}

export async function duplicateHistoryController(req: Request, res: Response) {
  try {
    const userId = req.currentUser?.id;
    const { id } = req.params;
    if (!userId || !id) {
      return res.status(401).json({ error: { message: "Unauthorized or missing ID" } });
    }
    const result = await duplicateReportHistory(id, userId);
    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ error: { message: error instanceof Error ? error.message : "Internal Server Error" } });
  }
}
