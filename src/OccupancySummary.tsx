export function OccupancySummary({name,percentage,loading=false}: {name:string;percentage:number|null;loading?:boolean}) {
  return (
                    <span className="occupancy-row">
                      <span className="facility-name">{name}</span>
                      <span className="row-meter">
                      {percentage !== null ? (
                        <span
                          role="meter"
                          className="occupancy-meter"
                          data-level={
                            percentage < 35
                              ? "low"
                              : percentage < 65
                                ? "moderate"
                                : "high"
                          }
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percentage}
                          aria-label={`${name} occupancy`}
                        >
                          <span className="occupancy-fill" style={{ width: `${percentage}%` }} aria-hidden="true" />
                        </span>
                      ) : (
                        <span
                          className={`empty-meter ${loading ? "skeleton" : ""}`}
                          aria-hidden="true"
                        />
                      )}
                      </span>
                      <span className="occupancy-value">
                        {loading ? <span className="skeleton h-5 w-10 rounded" aria-label="Loading" /> : percentage === null ? <span className="unavailable-value">—</span> : `${percentage}%`}
                      </span>
                      <span className="occupancy-status" data-level={percentage === null ? 'unknown' : percentage < 35 ? 'low' : percentage < 65 ? 'moderate' : 'high'}>
                        {percentage === null ? (loading ? 'Checking' : 'Unavailable') : percentage < 35 ? 'Quiet' : percentage < 65 ? 'Not too busy' : 'Busy'}
                      </span>
                    </span>
  );
}
