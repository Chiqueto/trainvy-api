import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(()=>({
  query:vi.fn(),findMany:vi.fn(),deleteMany:vi.fn(),createMany:vi.fn(),updateMany:vi.fn(),
}));
vi.mock("../src/lib/db.js",()=>({prisma:{$transaction:async(callback:(tx:unknown)=>Promise<unknown>)=>callback({$queryRaw:mock.query,exercise:{findMany:mock.findMany,updateMany:mock.updateMany},exerciseMuscle:{deleteMany:mock.deleteMany,createMany:mock.createMany}})}}));
import { ReconcileExerciseMuscles } from "../src/usecases/ReconcileExerciseMuscles.js";
import { REVIEWED_EXERCISES_BY_ID, reviewedMuscles } from "../src/domain/exercise-catalog-review.js";

const id="00000000-0000-4000-8000-000000000147";
const definition=REVIEWED_EXERCISES_BY_ID.get(id)!;
const original={id,name:definition.name,updatedAt:new Date("2026-10-27"),muscles:[{muscleGroup:"SHOULDERS",role:"PRIMARY"},{muscleGroup:"TRICEPS",role:"SECONDARY"}]};
beforeEach(()=>{vi.resetAllMocks();mock.findMany.mockResolvedValue([original]);});
describe("Explicit catalog reconciliation",()=>{
  it("dry-runs without writing and applies only reviewed global IDs, then becomes a no-op",async()=>{
    const reconciliation=new ReconcileExerciseMuscles([definition]);
    const preview=await reconciliation.execute({apply:false});
    expect(preview).toMatchObject({total:1,changed:0,planned:1});
    expect(mock.deleteMany).not.toHaveBeenCalled();expect(mock.createMany).not.toHaveBeenCalled();expect(mock.updateMany).not.toHaveBeenCalled();
    const result=await reconciliation.execute({apply:true,expectedFingerprint:preview.fingerprint});
    expect(result.changed).toBe(1);
    expect(mock.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{ownerUserId:null}}));
    expect(mock.deleteMany).toHaveBeenCalledWith({where:{exerciseId:{in:[id]},exercise:{ownerUserId:null}}});
    expect(mock.updateMany).toHaveBeenCalledWith({where:{id:{in:[id]},ownerUserId:null},data:{updatedAt:expect.any(Date)}});
    const insert=mock.createMany.mock.calls[0][0].data;
    expect(insert).toContainEqual({exerciseId:id,muscleGroup:"BICEPS",role:"SECONDARY"});
    expect(insert.some((m:{muscleGroup:string})=>m.muscleGroup==="TRICEPS")).toBe(false);
    mock.findMany.mockResolvedValue([{...original,muscles:reviewedMuscles(definition)}]);
    expect((await reconciliation.execute({apply:false})).planned).toBe(0);
  });
  it("rejects missing/stale fingerprints before writing",async()=>{
    const reconciliation=new ReconcileExerciseMuscles([definition]);
    await expect(reconciliation.execute({apply:true})).rejects.toThrow("Catalog changed");
    await expect(reconciliation.execute({apply:true,expectedFingerprint:"outdated"})).rejects.toThrow("Catalog changed");
    expect(mock.deleteMany).not.toHaveBeenCalled();
  });
  it("refuses unknown IDs and renamed exercises instead of guessing by name",async()=>{
    const reconciliation=new ReconcileExerciseMuscles([definition]);
    for(const row of [{...original,id:crypto.randomUUID()},{...original,name:"Outro movimento"}]){
      mock.findMany.mockResolvedValue([row]);
      await expect(reconciliation.execute({apply:false})).rejects.toThrow("Unreviewed or renamed");
    }
    expect(mock.deleteMany).not.toHaveBeenCalled();
  });
});
