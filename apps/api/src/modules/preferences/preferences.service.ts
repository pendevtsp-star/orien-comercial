import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface PreferenceInput {
  theme: string;
  colorMode: string;
  sidebarMode: string;
  density: string;
  startPage: string;
  dateFormat: string;
  reduceMotion: boolean;
  notifyInApp: boolean;
  notifyEmail: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  favoriteRoutes: string[];
  dashboardWidgets: string[];
}

@Injectable()
export class PreferencesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async get(userId: string) {
    await this.db.pool.query(
      "INSERT INTO user_preferences(user_id)VALUES($1) ON CONFLICT DO NOTHING",
      [userId],
    );
    const result = await this.db.pool.query(
      `SELECT theme,color_mode "colorMode",sidebar_mode "sidebarMode",density,start_page "startPage",date_format "dateFormat",reduce_motion "reduceMotion",notify_in_app "notifyInApp",notify_email "notifyEmail",quiet_hours_start::text "quietHoursStart",quiet_hours_end::text "quietHoursEnd",favorite_routes "favoriteRoutes",dashboard_widgets "dashboardWidgets" FROM user_preferences WHERE user_id=$1`,
      [userId],
    );
    return result.rows[0];
  }
  async update(userId: string, input: PreferenceInput) {
    const result = await this.db.pool.query(
      `INSERT INTO user_preferences(user_id,theme,color_mode,sidebar_mode,density,start_page,date_format,reduce_motion,notify_in_app,notify_email,quiet_hours_start,quiet_hours_end,favorite_routes,dashboard_widgets)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(user_id)DO UPDATE SET theme=EXCLUDED.theme,color_mode=EXCLUDED.color_mode,sidebar_mode=EXCLUDED.sidebar_mode,density=EXCLUDED.density,start_page=EXCLUDED.start_page,date_format=EXCLUDED.date_format,reduce_motion=EXCLUDED.reduce_motion,notify_in_app=EXCLUDED.notify_in_app,notify_email=EXCLUDED.notify_email,quiet_hours_start=EXCLUDED.quiet_hours_start,quiet_hours_end=EXCLUDED.quiet_hours_end,favorite_routes=EXCLUDED.favorite_routes,dashboard_widgets=EXCLUDED.dashboard_widgets,updated_at=now() RETURNING user_id`,
      [
        userId,
        input.theme,
        input.colorMode,
        input.sidebarMode,
        input.density,
        input.startPage,
        input.dateFormat,
        input.reduceMotion,
        input.notifyInApp,
        input.notifyEmail,
        input.quietHoursStart ?? null,
        input.quietHoursEnd ?? null,
        input.favoriteRoutes,
        input.dashboardWidgets,
      ],
    );
    return { ok: Boolean(result.rowCount), preferences: await this.get(userId) };
  }
}
